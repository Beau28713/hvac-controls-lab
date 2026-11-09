(*
  Machine Expert – HVAC template for a disconnected PLC bench.
  Adapt the tag names, units, scaling and local permit to your project.
  Configure the variables marked "Status Variable" in Configuration,
  then use those generated tags in the program. The VAR block below
  shows the remaining non-retentive program declarations.
*)
VAR
    BenchPermit_Local : BOOL := FALSE;  (* Bind to a PLC-local bench control *)
    BenchInitialized : BOOL := FALSE;
    BenchLastHeartbeat : INT := 0;
    BenchHeartbeatPulse : BOOL := FALSE;
    BenchSeenHeartbeat : BOOL := FALSE;
    BenchWatchdog : TON;
    BenchActive : BOOL := FALSE;
    BenchAI1_Value : REAL;
    BenchAI1_Good : BOOL;
    BenchFanProof : BOOL;

    AI1_Eng : REAL;       (* Use your existing scaled physical AI1 value *)
    AI1_Healthy : BOOL;   (* Use your existing physical sensor diagnostics *)
    FanProof_Physical : BOOL;
    FanRun_Command : BOOL;
    AI1_Used : REAL;
    AI1_Good_Used : BOOL;
    FanProof_Used : BOOL;
END_VAR

(*
  Status Variables (single-word INT, scale 1, offset 0):
    BenchHeartbeat   writable, range 0..32767
    SimAI1_Tenths    writable, raw range for your engineering units
    SimAI1_Good      writable, range 0..1
    SimFanProof      writable, range 0..1
    Bench_FanRun     read-only to the bridge, range 0..1
*)

BenchHeartbeatPulse := BenchHeartbeat <> BenchLastHeartbeat;
BenchLastHeartbeat := BenchHeartbeat;
IF NOT BenchInitialized OR NOT BenchPermit_Local THEN
    BenchInitialized := TRUE;
    BenchSeenHeartbeat := FALSE;
    BenchHeartbeatPulse := FALSE;
ELSIF BenchHeartbeatPulse THEN
    (* Commit a complete set of test values on the verified scan boundary. *)
    BenchAI1_Value := INT_TO_REAL(SimAI1_Tenths) / 10.0;
    BenchAI1_Good := SimAI1_Good = 1;
    BenchFanProof := SimFanProof = 1;
    BenchSeenHeartbeat := TRUE;
END_IF;

BenchWatchdog(IN := BenchSeenHeartbeat AND NOT BenchHeartbeatPulse, PT := T#6s);
IF BenchWatchdog.Q THEN
    BenchSeenHeartbeat := FALSE;
END_IF;
BenchActive := BenchPermit_Local AND BenchSeenHeartbeat AND NOT BenchWatchdog.Q;

AI1_Used := AI1_Eng;
AI1_Good_Used := AI1_Healthy;
FanProof_Used := FanProof_Physical;
IF BenchActive THEN
    AI1_Used := BenchAI1_Value;
    AI1_Good_Used := BenchAI1_Good;
    FanProof_Used := BenchFanProof;
END_IF;

(* Mirror the final command after the sequence calculates it. *)
IF FanRun_Command THEN
    Bench_FanRun := 1;
ELSE
    Bench_FanRun := 0;
END_IF;
