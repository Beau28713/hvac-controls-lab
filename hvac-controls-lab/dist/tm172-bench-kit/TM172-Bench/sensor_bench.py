"""Multi-point virtual HVAC field inputs for the local TM172 bench bridge."""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from math import exp, isfinite
import secrets
import socket
import struct
import time

MAX_POINTS = 16
BRIDGE_GAP = 4.0
SCAN_BUDGET = 3.0
MAP_LIFETIME = 600


class BenchError(Exception):
    pass


def number(value, low, high, label):
    if type(value) not in (int, float) or not low <= value <= high or not isfinite(value):
        raise BenchError(f"{label} must be between {low} and {high}.")
    return float(value)


def integer(value, low, high, label):
    if type(value) is not int or not low <= value <= high:
        raise BenchError(f"{label} must be an integer from {low} through {high}.")
    return value


def offset(value, label):
    return integer(value, 1, 65536, label) - 1


def flag(value, label):
    if type(value) is not bool:
        raise BenchError(f"{label} must be a Boolean.")
    return value


def signed(word):
    return word - 65536 if word >= 32768 else word


def encode(value, multiplier):
    return int((Decimal(str(value)) * multiplier).to_integral_value(rounding=ROUND_HALF_UP)) & 0xffff


@dataclass(frozen=True)
class Point:
    label: str
    kind: str
    address: int
    quality: object
    low: float
    high: float
    scale: int
    initial: float
    mode: str
    frames: tuple
    source: object
    follow: tuple

    @classmethod
    def parse(cls, raw):
        if not isinstance(raw, dict) or not isinstance(raw.get("label"), str):
            raise BenchError("Each channel needs a name.")
        label = raw["label"].strip()
        if not 1 <= len(label) <= 64:
            raise BenchError("Channel names must contain 1 to 64 characters.")
        kind = raw.get("kind")
        if kind not in ("analog", "digital"):
            raise BenchError(f"{label}: select an analog or digital channel.")
        address = offset(raw.get("address"), label + " project address")
        quality = None if raw.get("quality") is None else offset(raw["quality"], label + " quality address")
        if kind == "analog":
            scale = integer(raw.get("scale"), 1, 1000, label + " counts per unit")
            low = number(raw.get("low"), -32768 / scale, 32767 / scale, label + " minimum")
            high = number(raw.get("high"), -32768 / scale, 32767 / scale, label + " maximum")
            if low >= high:
                raise BenchError(f"{label}: minimum must be below maximum.")
        else:
            low, high, scale = 0, 1, 1
        def point_value(value):
            if kind == "digital":
                return integer(value, 0, 1, label + " contact value")
            return number(value, low, high, label + " value")

        initial = point_value(raw.get("value"))
        mode = raw.get("mode")
        if mode not in ("manual", "timeline", "follow"):
            raise BenchError(f"{label}: select a behavior.")
        frames, source, follow = (), None, ()
        if mode == "timeline":
            data = raw.get("frames")
            if not isinstance(data, list) or not 1 <= len(data) <= 50:
                raise BenchError(f"{label}: enter 1 to 50 timeline rows.")
            rows = []
            for row in data:
                if not isinstance(row, list) or len(row) != 4:
                    raise BenchError(f"{label}: use time, value, step/ramp, good/bad.")
                t = number(row[0], 0, 3600, label + " timeline time")
                if (not rows and t != 0) or (rows and t <= rows[-1][0]):
                    raise BenchError(f"{label}: start at 0 seconds and use increasing times.")
                if row[2] not in ("step", "ramp") or (kind == "digital" and row[2] == "ramp"):
                    raise BenchError(f"{label}: digital channels use steps. Analog channels can use steps or ramps.")
                rows.append((t, point_value(row[1]), row[2], flag(row[3], label + " quality")))
            if quality is None and any(not row[3] for row in rows):
                raise BenchError(f"{label}: map a quality word to schedule a bad-quality fault.")
            frames = tuple(rows)
        if mode == "follow":
            source = offset(raw.get("source"), label + " PLC feedback address")
            if kind == "digital":
                follow = (number(raw.get("onDelay"), 0, 120, label + " on delay"),
                          number(raw.get("offDelay"), 0, 120, label + " off delay"),
                          flag(raw.get("invert"), label + " invert"))
            else:
                source_low = integer(raw.get("sourceLow"), -32768, 32767, label + " low command")
                source_high = integer(raw.get("sourceHigh"), -32768, 32767, label + " high command")
                if source_low >= source_high:
                    raise BenchError(f"{label}: high command must exceed low command.")
                follow = (source_low, source_high, number(raw.get("lag"), 0, 120, label + " response lag"))
        return cls(label, kind, address, quality, low, high, scale, initial, mode, frames, source, follow)

    def live_value(self, value):
        if self.kind == "digital":
            return integer(value, 0, 1, self.label + " contact value")
        return number(value, self.low, self.high, self.label + " value")


@dataclass
class Channel:
    value: float
    requested: object = None
    changed_at: float = 0

    def follow_command(self, point, raw, elapsed, dt):
        if point.kind == "analog":
            src_low, src_high, lag = point.follow
            fraction = min(1, max(0, (raw - src_low) / (src_high - src_low)))
            target = point.low + fraction * (point.high - point.low)
            self.value = target if lag == 0 else target + (self.value - target) * exp(-dt / lag)
        else:
            on_delay, off_delay, invert = point.follow
            desired = int(bool(raw) != invert)
            if desired != self.requested:
                self.requested, self.changed_at = desired, elapsed
            if elapsed - self.changed_at >= (on_delay if desired else off_delay):
                self.value = desired
        return self.value


def timeline(frames, elapsed):
    previous = frames[0]
    for row in frames[1:]:
        if elapsed >= row[0]:
            previous = row
        else:
            if row[2] == "ramp":
                fraction = (elapsed - previous[0]) / (row[0] - previous[0])
                return previous[1] + fraction * (row[1] - previous[1]), previous[3]
            break
    return previous[1], previous[3]


def parse_map(data):
    raw_points = data.get("points")
    if not isinstance(raw_points, list) or not 1 <= len(raw_points) <= MAX_POINTS:
        raise BenchError(f"Map 1 to {MAX_POINTS} sensor channels.")
    points = tuple(Point.parse(raw) for raw in raw_points)
    heartbeat = offset(data.get("heartbeat"), "Heartbeat project address")
    writes = [heartbeat] + [a for p in points for a in (p.address, p.quality) if a is not None]
    if len(writes) != len(set(writes)):
        raise BenchError("Each value, quality, and heartbeat word needs a unique address.")
    sources = {p.source for p in points if p.source is not None}
    if sources.intersection(writes):
        raise BenchError("PLC feedback sources are read-only and must be separate from every write address.")
    return points, heartbeat, set(writes), sources


def matching(candidate, expected):
    return bool(expected and isinstance(candidate, str) and candidate.isascii()
                and secrets.compare_digest(candidate, expected))


class SensorBench:
    def __init__(self, target_parser, bus_factory):
        self.target_parser = target_parser
        self.bus_factory = bus_factory
        self.map_ticket = ""
        self.map_expiry = 0
        self.run_id = ""
        self.last_tick = 0

    def active(self):
        if self.run_id and time.monotonic() - self.last_tick > BRIDGE_GAP:
            self.run_id = ""
        return bool(self.run_id)

    def handle(self, action, data):
        if action == "stop":
            if matching(data.get("run"), self.run_id):
                self.run_id = ""
            return {"stopped": True}
        if action == "read":
            if self.active():
                raise BenchError("Stop the current sensor test before reading a different map.")
            self.map_ticket = ""
            target = self.target_parser({**data, "address": 1, "engineeringUnit": "F"})
            points, heartbeat, writes, sources = parse_map(data)
            with self.bus_factory(target) as bus:
                words = bus.read(writes | sources)
            self.target, self.points, self.heartbeat = target, points, heartbeat
            self.write_addresses, self.sources = writes - {heartbeat}, sources
            self.heartbeat_value = (signed(words[heartbeat]) % 32767)
            self.map_ticket = secrets.token_urlsafe(24)
            self.map_expiry = time.monotonic() + MAP_LIFETIME
            return {"ticket": self.map_ticket,
                    "words": {a + 1: signed(word) for a, word in words.items()}}
        if action == "start":
            if (self.active() or not matching(data.get("ticket"), self.map_ticket)
                    or time.monotonic() >= self.map_expiry or data.get("confirmed") is not True):
                raise BenchError("Read the project map and confirm the isolated bench before starting.")
            self.map_ticket = ""
            self.run_id = secrets.token_urlsafe(24)
            self.start_time = self.last_tick = self.sample_time = time.monotonic()
            self.channels = [Channel(p.initial) for p in self.points]
            self.written = {}
            return {"run": self.run_id}
        if action == "exchange":
            if not self.active() or not matching(data.get("run"), self.run_id):
                raise BenchError("The test stopped or the bridge timed out. Read the map before restarting.")
            try:
                return self.exchange(data)
            except (BenchError, OSError) as exc:
                self.run_id = ""
                raise BenchError(f"Test stopped. Heartbeat updates ceased. Check the PLC before restarting. {exc}") from None
        raise BenchError("Unknown sensor bench action.")

    def exchange(self, data):
        controls = data.get("controls")
        if not isinstance(controls, list) or len(controls) != len(self.points):
            raise BenchError("The operator controls no longer match the armed map.")
        manual = []
        for point, control in zip(self.points, controls):
            if not isinstance(control, dict):
                raise BenchError("Invalid operator control.")
            valid = flag(control.get("valid"), point.label + " quality")
            if not valid and point.quality is None:
                raise BenchError(f"{point.label}: map a quality word before injecting bad quality.")
            override = flag(control.get("override"), point.label + " override")
            value = point.live_value(control.get("value")) if point.mode == "manual" or override else point.initial
            manual.append((value, valid, override))
        with self.bus_factory(self.target) as bus:
            feedback = bus.read(self.sources)
            now = time.monotonic()
            elapsed, dt = now - self.start_time, now - self.sample_time
            expected, result = {}, []
            for point, channel, (value, valid, override) in zip(self.points, self.channels, manual):
                operator_value = value
                raw_feedback = None
                if point.mode == "timeline":
                    value, timeline_valid = timeline(point.frames, elapsed)
                    valid = valid and timeline_valid
                elif point.mode == "follow":
                    raw_feedback = signed(feedback[point.source])
                    value = channel.follow_command(point, raw_feedback, elapsed, dt)
                if override:
                    value = operator_value
                raw = encode(value, point.scale)
                expected[point.address] = raw
                if point.quality is not None:
                    expected[point.quality] = int(valid)
                result.append({"value": signed(raw) / point.scale, "raw": signed(raw), "valid": valid,
                               "feedback": raw_feedback})
            for address, word in sorted(expected.items()):
                if self.written.get(address) != word:
                    bus.write(address, word)
            returned = bus.read(self.write_addresses)
            for address, word in expected.items():
                if returned[address] != word:
                    raise BenchError(f"Readback mismatch at project address {address + 1}. Check the map and PLC logic.")
            self.heartbeat_value = self.heartbeat_value % 32767 + 1
            bus.write(self.heartbeat, self.heartbeat_value)
            if bus.read({self.heartbeat})[self.heartbeat] != self.heartbeat_value:
                raise BenchError("Heartbeat readback mismatch. Check the dedicated heartbeat variable.")
        self.written = expected
        self.sample_time = now
        self.last_tick = time.monotonic()
        return {"elapsed": round(elapsed, 2), "heartbeat": self.heartbeat_value, "points": result}
