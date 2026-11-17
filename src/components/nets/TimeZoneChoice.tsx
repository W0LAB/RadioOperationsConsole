import { useMemo } from "react";
import { allZones, localZone, zoneName } from "../../timeZones";

/**
 * Which time zone a net's times are written in (NETL-040): one dropdown
 * offering Local and Zulu (UTC) first, then every other zone by name. A net
 * is entered as it is published, never converted by hand. Changing it keeps
 * the times as written (NETL-041).
 */
export default function TimeZoneChoice({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const local = localZone();
  const others = useMemo(() => allZones().filter((z) => z !== local && z !== "UTC"), [local]);
  // A stored zone this browser doesn't list still shows, as itself.
  const unlisted = value !== local && value !== "UTC" && !others.includes(value);

  return (
    <label className="net-zone">
      Times in
      <select aria-label="Time zone" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={local}>Local ({zoneName(local)})</option>
        {local !== "UTC" && <option value="UTC">Zulu (UTC)</option>}
        {unlisted && <option value={value}>{zoneName(value)}</option>}
        <optgroup label="Other zones">
          {others.map((z) => (
            <option key={z} value={z}>
              {zoneName(z)}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

/** "Times are UTC", "Times are local (America/New_York)": said beside the times (NETL-041). */
export function zoneHint(zone: string): string {
  if (zone === localZone()) return `Times are local (${zoneName(zone)}).`;
  return zone === "UTC" ? "Times are UTC (Zulu)." : `Times are ${zoneName(zone)} time.`;
}
