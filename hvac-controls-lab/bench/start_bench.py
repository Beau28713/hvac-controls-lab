"""Local browser and one-register Modbus TCP bridge for a TM172 test bench."""
import argparse
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import IPv4Address, IPv4Network
import json
from pathlib import Path
import secrets
import socket
import struct
import threading
import time
from urllib.parse import urlsplit
import webbrowser

from sensor_bench import BenchError, SCAN_BUDGET, SensorBench

ROOT = Path(__file__).resolve().parent / "web"
BENCH_NETWORKS = tuple(map(IPv4Network, ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")))
MODBUS_TIMEOUT = 2.0
MODBUS_PORT = 502
TICKET_SECONDS = 600
TEMP_MIN_F = -40
TEMP_MAX_F = 180


@dataclass(frozen=True)
class Target:
    host: str
    unit: int
    offset: int
    engineering_unit: str

    @classmethod
    def parse(cls, data):
        try:
            host = IPv4Address(data["host"])
        except (KeyError, ValueError):
            raise BenchError("Enter the PLC's private IPv4 address.") from None
        if not any(host in net for net in BENCH_NETWORKS):
            raise BenchError("Use a private IPv4 address on your isolated bench network.")
        unit = data.get("unit")
        address = data.get("address")
        engineering_unit = data.get("engineeringUnit")
        if type(unit) is not int or not 1 <= unit <= 255:
            raise BenchError("Enter a Modbus unit ID from 1 through 255.")
        if type(address) is not int or not 1 <= address <= 65536:
            raise BenchError("Enter the one-based Status Variable address from Machine Expert – HVAC.")
        if engineering_unit not in ("F", "C"):
            raise BenchError("Select the temperature unit used by the PLC application.")
        return cls(str(host), unit, address - 1, engineering_unit)

    def encode_temperature(self, temp_f):
        if type(temp_f) not in (int, float) or not TEMP_MIN_F <= temp_f <= TEMP_MAX_F:
            raise BenchError("Enter a simulated temperature from −40 to 180 °F.")
        value = Decimal(str(temp_f))
        if self.engineering_unit == "C":
            value = (value - 32) * 5 / 9
        return int((value * 10).to_integral_value(rounding=ROUND_HALF_UP)) & 0xffff

    def result(self, raw):
        signed = struct.unpack(">h", struct.pack(">H", raw))[0]
        return {"word": raw, "signed": signed, "temperature": signed / 10, "unit": self.engineering_unit}


def receive_exact(conn, count):
    data = bytearray()
    while len(data) < count:
        chunk = conn.recv(count - len(data))
        if not chunk:
            raise BenchError("The PLC closed the connection before returning a complete reply.")
        data.extend(chunk)
    return bytes(data)


def modbus_exchange(conn, unit, pdu):
    transaction = secrets.randbits(16)
    function = pdu[0]
    conn.sendall(struct.pack(">HHHB", transaction, 0, len(pdu) + 1, unit) + pdu)
    reply_id, protocol, length, reply_unit = struct.unpack(">HHHB", receive_exact(conn, 7))
    if (reply_id, protocol, reply_unit) != (transaction, 0, unit) or not 2 <= length <= 254:
        raise BenchError("The PLC returned an invalid Modbus TCP header. Check the unit ID and target.")
    reply = receive_exact(conn, length - 1)
    if reply[0] == (function | 0x80) and len(reply) == 2:
        hint = {1: "illegal function", 2: "illegal register address", 3: "illegal data value", 4: "device failure"}.get(reply[1], "device exception")
        raise BenchError(f"PLC replied with Modbus exception {reply[1]} ({hint}) for FC{function:02d}.")
    return reply


def request(conn, unit, function, address, operand):
    pdu = struct.pack(">BHH", function, address, operand)
    reply = modbus_exchange(conn, unit, pdu)
    if function == 3 and len(reply) == 4 and reply[:2] == b"\x03\x02":
        return struct.unpack(">H", reply[2:])[0]
    if function == 6 and reply == pdu:
        return None
    raise BenchError(f"The PLC returned an unexpected reply for FC{function:02d}.")


def read_or_write(target, value=None):
    try:
        with socket.create_connection((target.host, MODBUS_PORT), timeout=MODBUS_TIMEOUT) as conn:
            if value is None:
                return request(conn, target.unit, 3, target.offset, 1)
            try:
                request(conn, target.unit, 6, target.offset, value)
                observed = request(conn, target.unit, 3, target.offset, 1)
            except (BenchError, OSError) as exc:
                raise BenchError(f"Write outcome unverified. Read the register before sending again. {exc}") from None
            if observed != value:
                actual = target.result(observed)
                raise BenchError(f"Readback differed: PLC returned {actual['signed']} instead of {target.result(value)['signed']}. Check the Status Variable and whether the PLC program overwrites it.")
            return observed
    except OSError as exc:
        raise BenchError(f"Could not complete a connection to {target.host}:{MODBUS_PORT}. Check the cable, subnet, IP, and Modbus TCP server. {exc}") from None


class SensorBus:
    def __init__(self, target):
        self.target = target

    def __enter__(self):
        self.deadline = time.monotonic() + SCAN_BUDGET
        try:
            self.conn = socket.create_connection((self.target.host, MODBUS_PORT), timeout=MODBUS_TIMEOUT)
        except OSError as exc:
            raise BenchError(f"Cannot connect to {self.target.host}:{MODBUS_PORT}. Check the isolated network and PLC Modbus TCP settings. {exc}") from None
        return self

    def __exit__(self, *exception):
        self.conn.close()

    def exchange(self, pdu):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise BenchError("The Modbus scan exceeded its time budget.")
        self.conn.settimeout(min(MODBUS_TIMEOUT, remaining))
        try:
            return modbus_exchange(self.conn, self.target.unit, pdu)
        except OSError as exc:
            raise BenchError(f"Modbus communication failed. {exc}") from None

    def read(self, addresses):
        groups = []
        for address in sorted(addresses):
            if groups and groups[-1][-1] + 1 == address:
                groups[-1].append(address)
            else:
                groups.append([address])
        values = {}
        for group in groups:
            count = len(group)
            reply = self.exchange(struct.pack(">BHH", 3, group[0], count))
            if len(reply) != 2 + 2 * count or reply[:2] != bytes((3, count * 2)):
                raise BenchError("Unexpected holding register readback.")
            values.update(zip(group, struct.unpack(">" + "H" * count, reply[2:])))
        return values

    def write(self, address, word):
        pdu = struct.pack(">BHH", 6, address, word)
        if self.exchange(pdu) != pdu:
            raise BenchError(f"Unexpected write reply for project address {address + 1}.")


class BenchState:
    def __init__(self):
        self.secret = secrets.token_urlsafe(32)
        self.lock = threading.RLock()
        self.target = None
        self.ticket = ""
        self.expires = 0

    def handle(self, action, data):
        with self.lock:
            if action == "read":
                self.ticket = ""
                target = Target.parse(data)
                value = read_or_write(target)
                self.target = target
                self.ticket = secrets.token_urlsafe(24)
                self.expires = time.monotonic() + TICKET_SECONDS
                return {**target.result(value), "ticket": self.ticket}
            ticket = data.get("ticket")
            if (not self.ticket or time.monotonic() >= self.expires
                    or not isinstance(ticket, str) or not ticket.isascii()
                    or not secrets.compare_digest(self.ticket, ticket)):
                raise BenchError("Read the configured register before sending a temperature.")
            value = self.target.encode_temperature(data.get("temperatureF"))
            try:
                return self.target.result(read_or_write(self.target, value))
            except BenchError:
                self.ticket = ""
                raise


STATIC_FILES = {
    "/", "/index.html", "/styles.css", "/app.mjs", "/model.mjs", "/bench.mjs",
    "/sensor-bench.html", "/sensor-bench.css", "/sensor-bench.mjs",
    "/PLC-SETUP.txt", "/TM172-Selector.st"
}


class BenchHandler(SimpleHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(8)

    def local_host(self):
        return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

    def json_response(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.local_host():
            self.send_error(HTTPStatus.FORBIDDEN)
        elif self.path == "/bench-api/session":
            self.json_response(200, {"token": self.server.state.secret})
        elif urlsplit(self.path).path in STATIC_FILES:
            super().do_GET()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_HEAD(self):
        if self.local_host() and urlsplit(self.path).path in STATIC_FILES:
            super().do_HEAD()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def guess_type(self, path):
        return "text/javascript" if path.endswith(".mjs") else super().guess_type(path)

    def do_POST(self):
        state = self.server.state
        origin = f"http://127.0.0.1:{self.server.server_port}"
        token = self.headers.get("X-Bench-Token", "")
        if (not self.local_host() or self.headers.get("Origin") != origin
                or not token.isascii() or not secrets.compare_digest(token, state.secret)):
            self.json_response(403, {"error": "Open the lab from the local bench bridge."})
            return
        legacy = self.path in ("/bench-api/read", "/bench-api/send")
        sensor = self.path in ("/sensor-api/read", "/sensor-api/start", "/sensor-api/exchange", "/sensor-api/stop")
        if not legacy and not sensor:
            self.json_response(404, {"error": "Unknown bench action."})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= (65536 if sensor else 2048) or self.headers.get_content_type() != "application/json":
                raise ValueError
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError
        except (ValueError, UnicodeError):
            self.json_response(400, {"error": "Invalid bench request."})
            return
        try:
            action = self.path.rsplit("/", 1)[-1]
            with state.lock:
                if legacy:
                    if self.server.sensors.active():
                        raise BenchError("Stop the multi-sensor test before using the single-point tool.")
                    result = state.handle(action, data)
                else:
                    result = self.server.sensors.handle(action, data)
                    if action == "start":
                        state.ticket = ""
            self.json_response(200, result)
        except BenchError as exc:
            self.json_response(400, {"error": str(exc)})


def make_server(web_dir=ROOT, port=0):
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(BenchHandler, directory=str(web_dir)))
    server.state = BenchState()
    server.sensors = SensorBench(Target.parse, SensorBus)
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-browser", action="store_true", help="Print the local URL without opening a browser")
    args = parser.parse_args()
    if not (ROOT / "index.html").is_file():
        parser.exit(1, "Extract the entire bench kit before starting the bridge. The web folder is required.\n")
    with make_server() as server:
        url = f"http://127.0.0.1:{server.server_port}/sensor-bench.html"
        print(f"HVAC Controls Lab bench mode\n{url}\nPress Ctrl+C to stop the local bridge.", flush=True)
        if not args.no_browser:
            threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
