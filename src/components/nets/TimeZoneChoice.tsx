import { useMemo, useState } from "react";
import { allZones, localZone, zoneName } from "../../timeZones";

/**
 * Which time zone a net's times are written in (NETL-040): Local, Zulu
 * (UTC), or any other zone by name. A net is entered as it is published,
 * never converted by hand. Changing it keeps the times as written (NETL-041).
 */
export default function TimeZoneChoice({
  value,
  onChange,
  name = "net-time-zone",
}: {
  value: string;
  onChange: (zone: string) => void;
  /** Groups the radio buttons; differs when two choices are on screen. */
  name?: string;
}) {
  const local = localZone();
  const choice = value === local ? "local" : value === "UTC" ? "utc" : "other";
  // "Other…" stays open once chosen, even while it holds this computer's zone or UTC.
  const [otherOpen, setOtherOpen] = useState(choice === "other");
  const zones = useMemo(allZones, []);
  const shown = otherOpen ? "other" : choice;

  return (
    <div className="inline-form" role="radiogroup" aria-label="Time zone">
      <span aria-hidden="true">Times are in</span>
      <label className="checkbox-row">
        <input
          type="radio"
          name={name}
          checked={shown === "local"}
          onChange={() => {
            setOtherOpen(false);
            onChange(local);
          }}
        />
        Local ({zoneName(local)})
      </label>
      {local !== "UTC" && (
        <label className="checkbox-row">
          <input
            type="radio"
            name={name}
            checked={shown === "utc"}
            onChange={() => {
              setOtherOpen(false);
              onChange("UTC");
            }}
          />
          Zulu (UTC)
        </label>
      )}
      <label className="checkbox-row">
        <input type="radio" name={name} checked={shown === "other"} onChange={() => setOtherOpen(true)} />
        Other…
      </label>
      {shown === "other" && (
        <select aria-label="Other time zone" value={value} onChange={(e) => onChange(e.target.value)}>
          {!zones.includes(value) && <option value={value}>{zoneName(value)}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {zoneName(z)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** "Times are UTC", "Times are local (America/New_York)": said beside the times (NETL-041). */
export function zoneHint(zone: string): string {
  if (zone === localZone()) return `Times are local (${zoneName(zone)}).`;
  return zone === "UTC" ? "Times are UTC (Zulu)." : `Times are ${zoneName(zone)} time.`;
}
