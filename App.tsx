import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import GoMeddo, {
  AvailabilitySlotType,
  Environment,
  Lead,
  Reservation,
} from "@gomeddo/sdk";

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Request failed";
}

function parseSfDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const ENV_OPTIONS: { label: string; value: Environment }[] = [
  { label: "Production", value: Environment.PRODUCTION },
  { label: "Staging", value: Environment.STAGING },
  { label: "Acceptance", value: Environment.ACCEPTANCE },
  { label: "Develop", value: Environment.DEVELOP },
];

type ResourceRow = { id: string; name: string };

type ReservationRow = { id: string; name: string; detail: string };

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [environment, setEnvironment] = useState(Environment.PRODUCTION);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** First resource id from last successful resources call — used for time slots demo */
  const [resourceIdForSlots, setResourceIdForSlots] = useState<string | null>(
    null,
  );
  /** Populated after “Fetch resources” — sorted by name */
  const [resourceRows, setResourceRows] = useState<ResourceRow[]>([]);
  /** Populated after “Fetch reservations” — sorted by name */
  const [reservationRows, setReservationRows] = useState<ReservationRow[]>([]);
  /** Lead fields for demo reservation (see GoMeddo booking demo) */
  const [leadFirstName, setLeadFirstName] = useState("Mohammad");
  const [leadLastName, setLeadLastName] = useState("Mujahid");
  const [leadEmail, setLeadEmail] = useState("mujahid.mohammad@gmail.com");

  const requireClient = useCallback(() => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError("Enter an API key from welcome.gomeddo.com (see GoMeddo docs).");
      return null;
    }
    return new GoMeddo(trimmed, environment);
  }, [apiKey, environment]);

  const runFetchResources = useCallback(async () => {
    setError(null);
    setResult(null);
    setResourceRows([]);
    setReservationRows([]);
    const client = requireClient();
    if (!client) return;
    setLoading(true);
    try {
      const resourceResult = await client.buildResourceRequest().getResults();
      const count = resourceResult.numberOfresources();
      const ids = resourceResult.getResourceIds();
      const rows: ResourceRow[] = ids
        .map((id) => {
          const r = resourceResult.getResource(id);
          return { id, name: r?.name?.trim() ? r.name : id };
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
      setResourceRows(rows);
      const firstId = ids[0] ?? null;
      setResourceIdForSlots(firstId);
      setResult(
        `Resources: ${count} returned. First resource id (for time slots): ${firstId ?? "none"}.`,
      );
    } catch (e: unknown) {
      setResourceRows([]);
      setReservationRows([]);
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [requireClient]);

  const runFetchReservations = useCallback(async () => {
    setError(null);
    setResult(null);
    setReservationRows([]);
    const client = requireClient();
    if (!client) return;
    setLoading(true);
    try {
      const rangeStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rangeEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const reservationResult = await client
        .buildReservationRequest()
        .withEndDatetimeAfter(rangeStart)
        .withStartDatetimeBefore(rangeEnd)
        .includeAdditionalField("Name")
        .includeAdditionalField("B25__Start__c")
        .includeAdditionalField("B25__End__c")
        .getResults();
      const n = reservationResult.numberOfReservations();
      const ids = reservationResult.getReservationIds();
      const rows: ReservationRow[] = ids
        .map((id) => {
          const res = reservationResult.getReservation(id);
          const nameRaw = res?.getCustomProperty("Name");
          const name =
            typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : id;
          const start =
            res?.getStartDatetime() ??
            parseSfDate(res?.getCustomProperty("B25__Start__c"));
          const end =
            res?.getEndDatetime() ??
            parseSfDate(res?.getCustomProperty("B25__End__c"));
          let detail = "";
          if (start && end) {
            detail = `${start.toISOString().slice(0, 16)} → ${end.toISOString().slice(0, 16)} UTC`;
          }
          return { id, name, detail };
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
      setReservationRows(rows);
      setResult(
        `Reservations (UTC window ~7d past → 90d future): ${n} returned. (@gomeddo/sdk ${GoMeddo.version})`,
      );
    } catch (e: unknown) {
      setReservationRows([]);
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [requireClient]);

  const runFetchTimeSlots = useCallback(async () => {
    setError(null);
    setResult(null);
    const client = requireClient();
    if (!client) return;
    if (!resourceIdForSlots) {
      setError(
        "Run “Fetch resources” first so a resource id is available for time slots.",
      );
      return;
    }
    setLoading(true);
    try {
      const rangeStart = new Date();
      rangeStart.setUTCHours(0, 0, 0, 0);
      const rangeEnd = new Date(rangeStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const slotsResult = await client
        .buildTimeSlotsRequest(rangeStart, rangeEnd)
        .withField("B25__Resource__c", resourceIdForSlots)
        .withDuration(60)
        .withInterval(60)
        .getResults();
      const n = slotsResult.numberOfTimeSlots();
      setResult(
        `Time slots (7d UTC from today, 60m duration/interval, resource ${resourceIdForSlots}): ${n} slot(s) returned.`,
      );
    } catch (e: unknown) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [requireClient, resourceIdForSlots]);

  const runCreateDemoReservation = useCallback(async () => {
    setError(null);
    setResult(null);
    const client = requireClient();
    if (!client) return;
    if (!resourceIdForSlots) {
      setError(
        "Run “1 · Fetch resources” first so a resource id is selected for booking.",
      );
      return;
    }
    const fn = leadFirstName.trim();
    const ln = leadLastName.trim();
    const em = leadEmail.trim();
    if (!fn || !ln || !em) {
      setError("Enter first name, last name, and email for the demo lead.");
      return;
    }
    setLoading(true);
    try {
      const slotDayStart = new Date();
      slotDayStart.setUTCDate(slotDayStart.getUTCDate() + 1);
      slotDayStart.setUTCHours(0, 0, 0, 0);
      const slotDayEnd = new Date(slotDayStart.getTime() + 24 * 60 * 60 * 1000);

      const resourceResult = await client
        .buildResourceRequest()
        .includeAllResourcesAt(resourceIdForSlots)
        .withAvailableSlotsBetween(slotDayStart, slotDayEnd)
        .getResults();

      let targetResource = null;
      let chosenSlot = null;
      for (const rid of resourceResult.getResourceIds()) {
        const res = resourceResult.getResource(rid);
        if (!res) continue;
        const slots = res.getTimeSlots();
        const open = slots.find((s) => s.type === AvailabilitySlotType.OPEN);
        if (open) {
          targetResource = res;
          chosenSlot = open;
          break;
        }
      }
      if (!targetResource || !chosenSlot) {
        throw new Error(
          "No OPEN slot found for tomorrow (UTC) on this resource tree. Try another resource in step 1 or another day in code.",
        );
      }

      const reservation = new Reservation();
      reservation.setResource(targetResource);
      reservation.setStartDatetime(new Date(chosenSlot.startOfSlot));
      reservation.setEndDatetime(new Date(chosenSlot.endOfSlot));
      reservation.setLead(new Lead(fn, ln, em));

      const saved = await client.saveReservation(reservation);
      const savedName = saved.getCustomProperty("Name");
      setResult(
        `Reservation saved. Id: ${saved.id}${
          savedName != null ? ` · Name: ${String(savedName)}` : ""
        } · Resource: ${targetResource.name} · Slot (UTC): ${new Date(
          chosenSlot.startOfSlot,
        ).toISOString()} → ${new Date(chosenSlot.endOfSlot).toISOString()}`,
      );
    } catch (e: unknown) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [
    requireClient,
    resourceIdForSlots,
    leadFirstName,
    leadLastName,
    leadEmail,
  ]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.title}>GoMeddo SDK · React Native POC</Text>
        <Text style={styles.body}>
          The official package <Text style={styles.mono}>@gomeddo/sdk.</Text>{" "}
          Install and wire it like any other npm dependency. Use an API key from
          your widget setup per GoMeddo prerequisites.
        </Text>

        <Text style={styles.label}>Environment</Text>
        <View style={styles.envRow}>
          {ENV_OPTIONS.map((opt) => {
            const selected = environment === opt.value;
            return (
              <Pressable
                key={opt.label}
                onPress={() => setEnvironment(opt.value)}
                style={[styles.envChip, selected && styles.envChipSelected]}
              >
                <Text
                  style={[
                    styles.envChipText,
                    selected && styles.envChipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>API key</Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="Paste API key"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />

        <Pressable
          onPress={runFetchResources}
          disabled={loading}
          style={[styles.button, loading && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>1 · Fetch Resources</Text>
        </Pressable>

        <Pressable
          onPress={runFetchReservations}
          disabled={loading}
          style={[
            styles.button,
            loading && styles.buttonDisabled,
            styles.buttonSpacing,
          ]}
        >
          <Text style={styles.buttonText}>2 · Fetch Reservations</Text>
        </Pressable>

        <Pressable
          onPress={runFetchTimeSlots}
          disabled={loading}
          style={[
            styles.button,
            loading && styles.buttonDisabled,
            styles.buttonSpacing,
          ]}
        >
          <Text style={styles.buttonText}>3 · Fetch Time Slots</Text>
        </Pressable>

        <Text style={[styles.label, styles.sectionLabel]}>
          Demo lead (4 · save reservation)
        </Text>
        <Text style={styles.hint}>
          Matches the flow on the{" "}
          <Text style={styles.mono}>GoMeddo-Booking-Demo</Text> page:
          availability for tomorrow (UTC), first OPEN slot, then{" "}
          <Text style={styles.mono}>saveReservation</Text>. Creates a real
          reservation in your org — use sandbox where possible.
        </Text>
        <TextInput
          value={leadFirstName}
          onChangeText={setLeadFirstName}
          placeholder="First name"
          autoCapitalize="words"
          style={[styles.input, styles.inputTight]}
        />
        <TextInput
          value={leadLastName}
          onChangeText={setLeadLastName}
          placeholder="Last name"
          autoCapitalize="words"
          style={[styles.input, styles.inputTight]}
        />
        <TextInput
          value={leadEmail}
          onChangeText={setLeadEmail}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
        />

        <Pressable
          onPress={runCreateDemoReservation}
          disabled={loading}
          style={[
            styles.button,
            loading && styles.buttonDisabled,
            styles.buttonSpacing,
          ]}
        >
          <Text style={styles.buttonText}>4 · Create Reservation</Text>
        </Pressable>

        {loading ? <ActivityIndicator style={styles.spinner} /> : null}

        {result ? <Text style={styles.success}>{result}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {resourceRows.length > 0 ? (
          <View style={styles.listSection}>
            <Text style={styles.listTitle}>
              All resources ({resourceRows.length})
            </Text>
            {resourceRows.map((row) => (
              <View key={row.id} style={styles.listRow}>
                <Text style={styles.listName}>{row.name}</Text>
                <Text style={styles.listId}>{row.id}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {reservationRows.length > 0 ? (
          <View style={styles.listSection}>
            <Text style={styles.listTitle}>
              All reservations ({reservationRows.length})
            </Text>
            {reservationRows.map((row) => (
              <View key={row.id} style={styles.listRow}>
                <Text style={styles.listName}>{row.name}</Text>
                {row.detail ? (
                  <Text style={styles.listDetail}>{row.detail}</Text>
                ) : null}
                <Text style={styles.listId}>{row.id}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f5f5f7",
  },
  scroll: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#333",
    marginBottom: 20,
  },
  mono: {
    fontFamily: "Menlo",
    fontSize: 14,
    color: "#111",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 8,
  },
  sectionLabel: {
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: "#555",
    marginBottom: 10,
  },
  inputTight: {
    marginBottom: 10,
  },
  envRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  envChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#e8e8ed",
  },
  envChipSelected: {
    backgroundColor: "#007aff",
  },
  envChipText: {
    fontSize: 13,
    color: "#333",
    fontWeight: "500",
  },
  envChipTextSelected: {
    color: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#007aff",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonSecondary: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#007aff",
  },
  buttonSecondaryText: {
    color: "#007aff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  buttonSpacing: {
    marginTop: 10,
  },
  spinner: {
    marginTop: 14,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  success: {
    marginTop: 16,
    fontSize: 15,
    color: "#1b5e20",
    lineHeight: 22,
  },
  error: {
    marginTop: 16,
    fontSize: 15,
    color: "#b00020",
    lineHeight: 22,
  },
  listSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ccc",
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginBottom: 10,
  },
  listRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e0e0e0",
  },
  listName: {
    fontSize: 15,
    color: "#111",
    fontWeight: "500",
  },
  listDetail: {
    fontSize: 13,
    color: "#444",
    marginTop: 4,
  },
  listId: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontFamily: "Menlo",
  },
});
