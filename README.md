# HVAC Controls Lab

**An HVAC sequence simulation and virtual sensor test bench for controls development, training, and PLC application testing.**

HVAC Controls Lab is a work-in-progress engineering project for experimenting with air-handling-unit (AHU) operation, HVAC sequences, alarms, and simulated field signals. It combines an interactive HVAC workbench with a configurable **Virtual Sensor Bench** designed to help test PLC logic without requiring a complete physical HVAC installation.

The current PLC-oriented workflow targets **Schneider Electric Modicon M172 / EcoStruxure Machine Expert – HVAC** projects. The virtual sensor interface includes a **Modbus TCP** project connection and configurable mapping for PLC application variables.

> **Project status:** Active development. The screenshots show a working simulation interface and editable sensor channels; the PLC connection shown is **offline**, and the displayed sensor channels are **unmapped**. Do not interpret the UI as evidence of completed or validated communication with physical PLC hardware.

## What it does

### AHU sequence workbench

- Visualizes an air-handling unit with outdoor-air damper, mixing section, filter, cooling coil, and supply fan.
- Shows operating state, supply-air temperature, target temperature, equipment commands/feedback, alarms, and live trends.
- Supports step/run controls and scenario selection for exploring control behavior.
- Includes scenarios displayed in the workbench such as:
  - Mechanical cooling
  - Economizer changeover
  - Fan-proof failure
  - Freeze-stat trip
  - Hydronic lead/lag
  - Pump-proof failover

### Virtual Sensor Bench

The bench presents configurable analog values and digital contacts for controlled testing. The screenshot shows **11 channels**, with room in the interface for **up to 16 channels**.

| Channel                      | Signal type | Example unit / state |
| ---------------------------- | ----------- | -------------------- |
| Supply air temperature       | Analog      | °F                  |
| Outdoor air temperature      | Analog      | °F                  |
| Zone humidity                | Analog      | % RH                 |
| Duct static pressure         | Analog      | in. w.c.             |
| Filter differential pressure | Analog      | in. w.c.             |
| Supply airflow               | Analog      | CFM                  |
| Zone CO₂                    | Analog      | ppm                  |
| Air quality / TVOC           | Analog      | ppb                  |
| Supply fan proof             | Digital     | Open / Closed        |
| Occupancy request            | Digital     | Open / Closed        |
| Freeze-stat normal           | Digital     | Open / Closed        |

Sensor values can be adjusted using manual controls. The interface also provides **Configure channel**, **Save map**, and **Load map** functions. The project is being developed toward timed test sequences and feedback that responds to PLC output commands.

### PLC integration design

The hardware-in-the-loop-oriented section includes:

- PLC IPv4 address and Modbus unit ID configuration.
- **Modbus TCP (port 502)** project connection settings.
- Configurable mapping of simulated signals to PLC holding-register-based application variables.
- A separate heartbeat address for communication supervision.
- A local Windows bench kit and PLC setup guidance in the UI.
- An example Structured Text (ST) selector workflow for choosing between physical signals and simulated values.

**Important:** The interface shown in the project screenshots is offline. Hardware communication, register mappings, scaling, and behavior must be configured and verified with the actual PLC project before use.

## Intended test workflow

1. Build or open your HVAC control application in **EcoStruxure Machine Expert – HVAC**.
2. Create dedicated application variables for virtual sensor values, digital states, quality flags, and heartbeat monitoring as needed.
3. Mirror relevant PLC output commands into separate variables when testing command-driven feedback.
4. Map the Virtual Sensor Bench channels to the corresponding PLC registers.
5. Use a PLC-local **simulation/bench-mode selector**, interlocks, and a communications watchdog to determine when simulated values may be used.
6. With the equipment **disconnected and safely isolated**, connect the bench to an isolated test network and verify register addressing, data types, and scaling.
7. Change sensor values, exercise control sequences, and check permissives, alarms, and fault handling.
8. Disable bench mode and verify that production logic returns to the intended physical-input path before any live-equipment use.

A suggested first test is **fan proof**: map the fan-proof contact to a PLC test tag, configure it to respond to a fan-run command with a short delay, and verify both successful proof and failure-to-prove behavior.

## Safety and limitations

> **For bench testing and development only.** This project is not a safety-rated system or a replacement for field commissioning, physical I/O verification, or independent protective devices.

- **Never allow a simulator to bypass a real freeze-stat, smoke detector, emergency stop, or other safety function on operating equipment.**
- Use simulated data only behind explicit, PLC-local test-mode logic with safe defaults and watchdog timeout handling.
- Keep test networks separated from live building/plant control networks.
- Verify physical analog/digital wiring and raw input scaling separately. A virtual Modbus value does **not** prove the physical input channel or sensor wiring.
- Do not expose the Modbus TCP bench service directly to the public internet.
- Follow the applicable site procedures and manufacturer documentation before connecting a PLC or energizing equipment.

## Repository setup

The exact install and launch commands depend on the application source and packaging added to this repository. **Do not assume the UI is launched by a particular Python module or web framework until the repository contains the corresponding files.**

Suggested repo organization (adapt to the actual codebase):

```text
HVAC-Controls-Lab/
├── README.md
├── app/                  # Simulator application source
├── bench/                # Local virtual-sensor / Modbus test components
├── plc-examples/         # Structured Text and mapping examples
├── docs/                 # Setup notes and diagrams
└── screenshots/          # UI captures for documentation
```

Once the code is committed, document here:

- Required Python/runtime version and dependencies.
- The exact install and local launch commands.
- How to start the Windows bench kit (if distributed).
- How to define an isolated PLC test connection and register map.
- Example PLC variables, data types, scaling, and watchdog behavior.

## Screenshots

Add project screenshots to a `screenshots/` folder and uncomment/update these links once committed:

<!--
![AHU workbench](screenshots/ahu-workbench.png)
![Virtual sensor project connection](screenshots/virtual-sensor-connection.png)
![Sensor channels](screenshots/sensor-channels.png)
![Machine Expert HVAC bench setup](screenshots/plc-setup.png)
-->

## Development roadmap

- [X] AHU simulator interface with selectable operating scenarios.
- [X] Interactive virtual sensor channel interface with analog and digital values.
- [X] PLC connection and mapping configuration UI.
- [ ] Verify end-to-end Modbus TCP communication with a physical M172 test controller.
- [ ] Publish and validate example register maps and ST bench-mode logic.
- [ ] Add/document timed ramps, steps, and repeatable fault-test sequences.
- [ ] Validate PLC-command-driven feedback (fan proof, damper response, etc.).
- [ ] Document test results and add automated regression tests where practical.

Checklist states are based on the shared interface screenshots, not a source-code audit.

## Who this is for

Controls engineers, building-automation professionals, PLC programmers, HVAC technicians, OEM application engineers, and anyone learning or developing HVAC control sequences.

## Feedback and contributions

Ideas, field-testing approaches, bug reports, and suggestions are welcome through GitHub Issues once the repository is available. Especially useful topics include analog signal scaling, register mapping, safety-conscious simulation mode design, and repeatable PLC sequence tests.

## License

**License not yet specified.** Add a `LICENSE` file if you intend others to reuse, modify, or distribute this project. Until then, public visibility of the repository alone does not grant an open-source license.

---

*HVAC Controls Lab is an independent engineering development project. Schneider Electric, Modicon, and EcoStruxure are trademarks of their respective owners; their mention does not imply endorsement.*
