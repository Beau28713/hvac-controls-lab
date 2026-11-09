HVAC CONTROLS LAB / TM172PDG BENCH KIT
====================================

The launcher opens the multi-sensor workbench. Use PLC-SETUP.txt and
TM172-Selector.st for project mapping, timed tests, and PLC feedback.
The Single-point temperature tool link opens the original workflow below.

1. Extract the entire ZIP on the bench laptop. Python 3.9+ is required.
   On Windows, open Start-TM172-Bench.cmd or run:
       py -3 start_bench.py
   On macOS or Linux, run:
       python3 start_bench.py
   The kit uses the Python standard library and opens the simulator on 127.0.0.1.

2. Use an isolated bench network with physical equipment disconnected.
   Connect the laptop and PLC by Ethernet, put them on the same subnet, and
   verify the TM172PDG Ethernet port and Modbus TCP server are enabled.
   Use the PLC's actual IP and verify the unit ID for your setup. The bridge
   connects to TCP port 502 and accepts private IPv4 addresses.

3. In a bench copy of your EcoStruxure Machine Expert – HVAC project, add
   SimAI1_Tenths in Configuration > Modbus Objects > Status Variables.
   Configure one writable signed 16-bit INT (INT device and application
   types, scale 1, offset 0). Use a Status Variable for this test point.
   Record the number in the Address column. The lab takes this one-based
   address and subtracts one for the wire offset. For example, project
   address 8960 becomes wire offset 8959. Use your actual assigned address.
   Keep the physical AI1 channel mapped and scaled normally.

4. Select the effective temperature in the PLC application before the
   normal sequence consumes it. The names below are example project tags.
   The PLC's local bench permit starts OFF and is separate from the web
   lab. For this example, AI1_Eng and AI1_Used are REAL temperatures in
   the same engineering unit selected in the lab.

       AI1_Used := AI1_Eng;
       IF BenchPermit_Local THEN
           AI1_Used := INT_TO_REAL(SimAI1_Tenths) / 10.0;
       END_IF;

   Keep the permit OFF initially. Verify the downloaded bench logic and
   I/O mapping using the Online Watch. Keep physical safety inputs in
   the safety chain.

5. In TM172 bench mode, enter the PLC IP, unit ID, Status Variable address,
   and the project temperature unit. Click Read register. In Online Watch,
   confirm you are targeting SimAI1_Tenths. Confirm bench writes, set the
   simulated temperature, and click Send temperature. The bridge writes
   one holding register and reads the same register back. Example: 72.5 °F
   gives 725 in a °F project. In a °C project it gives 225.
   Compare the raw value to Online Watch, then enable the PLC-local permit
   and confirm that AI1_Used follows the test value.

6. At the end, turn the PLC's local bench permit OFF and confirm AI1_Used
   follows the scaled physical input. Closing the lab or bridge leaves
   the last register value in the PLC. The web lab sends a single write per
   click, and its read authorization expires after ten minutes.

Schneider references
  Machine Expert – HVAC guide
  https://www.se.com/us/en/download/document/EIO0000003412/
  M172 hardware guide
  https://www.se.com/sa/en/download/document/EIO0000002015/
  M172 one-based Modbus addressing
  https://www.se.com/us/en/faqs/FAQ000255879/
