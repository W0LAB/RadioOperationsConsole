import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetListing, NetSession, Repeater } from "../../types";

vi.mock("../../api", () => ({
  listNetListings: vi.fn(),
  listRepeaters: vi.fn(),
  saveNetListing: vi.fn(() => Promise.resolve("n9")),
  setNetListingRetired: vi.fn(() => Promise.resolve()),
  deleteNetListing: vi.fn(() => Promise.resolve()),
}));

import * as api from "../../api";
import NetsTab from "./NetsTab";

const W4ABC: Repeater = {
  id: "r1",
  name: "W4ABC Orlando",
  output_mhz: 146.94,
  offset_mhz: -0.6,
  tone_in_kind: "pl",
  tone_in: "100.0",
  tone_out_kind: "pl",
  tone_out: "100.0",
  mode: "FM",
  location_label: "",
  location_lat: 28.54,
  location_lon: -81.38,
  notes: "",
  retired_at: "",
};

/** A net with one session, given flat as nets were before sessions. */
function listing(overrides: Partial<Omit<NetListing, "sessions"> & NetSession>): NetListing {
  const {
    repeater_id = "r1",
    frequency = "",
    schedule_kind = "weekly",
    weekdays = [2],
    weeks = [],
    all_day = false,
    start_time = "19:00",
    end_time = "19:30",
    season = "",
    ...shared
  } = overrides;
  return {
    id: "n1",
    name: "Tuesday Night Net",
    activity_type: "directed_net",
    checkin_info: "",
    run_by: "Orange County ARES",
    notes: "",
    retired_at: "",
    time_zone: "America/New_York",
    ...shared,
    sessions: [{ repeater_id, frequency, schedule_kind, weekdays, weeks, all_day, start_time, end_time, season }],
  };
}

const LISTINGS = [
  listing({ id: "asn", name: "SKYWARN Net", schedule_kind: "as_needed", weekdays: [], start_time: "", end_time: "", repeater_id: null, frequency: "147.000" }),
  listing({ id: "thu", name: "County ARES Net", schedule_kind: "monthly", weekdays: [4], weeks: ["2", "4"], start_time: "20:00", end_time: "" }),
  listing({ checkin_info: "Call sign and name, mobiles first" }),
  listing({ id: "wkd", name: "Morning Net", weekdays: [1, 2, 3, 4, 5], start_time: "07:00", end_time: "07:30" }),
];

// About 13 miles south-west of the repeater.
const PAT = {
  id: "op1",
  display_name: "Pat",
  call_sign: "K4NCS",
  location_label: "",
  location_lat: 28.4,
  location_lon: -81.5,
};

function renderTab(onStart: (p: unknown) => void = () => {}) {
  return render(<NetsTab operators={[PAT]} selectedOperatorId="op1" onStartActivity={onStart} />);
}

const day = (label: string) => screen.getByRole("region", { name: label });
/** Opens a folded section by its heading (NETL-027). */
async function unfold(user: ReturnType<typeof userEvent.setup>, label: string) {
  const toggle = within(day(label)).getByRole("button", { expanded: false });
  await user.click(toggle);
}
const rowIn = (region: HTMLElement, name: string) =>
  within(region).getByText(name).closest(".net-row") as HTMLElement;

describe("NetsTab", () => {
  beforeEach(() => {
    // Friday, October 2, 2026, 09:00 local. Only Date is faked, so user events still run.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0));
    vi.mocked(api.listNetListings).mockImplementation((retired = false) =>
      Promise.resolve(retired ? [] : LISTINGS)
    );
    vi.mocked(api.listRepeaters).mockImplementation((retired = false) =>
      Promise.resolve(retired ? [] : [W4ABC])
    );
    vi.mocked(api.saveNetListing).mockClear();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("lists the week ahead one day at a time, daily nets once, each other net under every day it meets (NETL-020)", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    // Daily first, then Sunday to Saturday; days without nets are left out.
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual([
      "Daily",
      "Tuesday",
      "Thursday",
      "As needed",
    ]);
    // The Mon–Fri net is listed once, with its days; today's run, already over, dimmed.
    expect(screen.getAllByText("Morning Net")).toHaveLength(1);
    const morning = rowIn(day("Daily"), "Morning Net");
    expect(within(morning).getByText("Mon–Fri")).toBeInTheDocument();
    expect(morning).toHaveClass("net-row-over");
    // A monthly net sits under its weekday with which weeks it meets.
    await unfold(user, "Thursday");
    expect(within(rowIn(day("Thursday"), "County ARES Net")).getByText("2nd & 4th")).toBeInTheDocument();
    await unfold(user, "As needed");
    expect(within(day("As needed")).getByText("SKYWARN Net")).toBeInTheDocument();
  });

  it("folds days other than today, saying how many nets and on which bands (NETL-027)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTab();
    await screen.findAllByText("Morning Net");
    const tuesday = day("Tuesday");
    expect(within(tuesday).queryByText("Tuesday Night Net")).not.toBeInTheDocument();
    expect(within(tuesday).getByRole("button", { expanded: false })).toHaveTextContent("Tuesday · 1 net · 2m");
    expect(within(day("Daily")).getByRole("button", { expanded: true })).toBeInTheDocument();

    // Opening a day is remembered on this computer.
    await unfold(user, "Tuesday");
    expect(within(day("Tuesday")).getByText("Tuesday Night Net")).toBeInTheDocument();
    unmount();
    renderTab();
    await screen.findAllByText("Tuesday Night Net");
    expect(within(day("Tuesday")).getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  it("opens every section with a match while searching", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    await user.type(screen.getByLabelText("Search nets"), "ARES Net");
    expect(within(day("Thursday")).getByText("County ARES Net")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search nets"));
    expect(within(day("Thursday")).queryByText("County ARES Net")).not.toBeInTheDocument();
  });

  it("shows each meeting on a line, the rest behind ⓘ (NETL-021)", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    await unfold(user, "Tuesday");
    await unfold(user, "As needed");
    const row = rowIn(day("Tuesday"), "Tuesday Night Net");
    expect(within(row).getByText("19:00–19:30")).toBeInTheDocument();
    expect(within(row).getByText("W4ABC Orlando")).toBeInTheDocument();
    expect(within(row).getByText("146.940 -0.600 PL 100.0")).toBeInTheDocument();
    expect(within(row).queryByText("Call sign and name, mobiles first")).not.toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "Show details of Tuesday Night Net" }));
    expect(within(row).getByText("Tuesdays 19:00–19:30")).toBeInTheDocument();
    expect(
      within(row).getByText("Output 146.940 · Input 146.340 (-0.600) · Tone PL 100.0 · FM")
    ).toBeInTheDocument();
    expect(within(row).getByText(/^W4ABC Orlando · 1\d\.\d mi away$/)).toBeInTheDocument();
    expect(within(row).getByText("Orange County ARES")).toBeInTheDocument();
    expect(within(row).getByText("Call sign and name, mobiles first")).toBeInTheDocument();
    expect(within(rowIn(day("As needed"), "SKYWARN Net")).getByText("147.000")).toBeInTheDocument();
  });

  it("lists only the nets on now or starting within 12 hours (NETL-025)", async () => {
    vi.setSystemTime(new Date(2026, 9, 5, 6, 40)); // Monday 06:40, 20 minutes before the Morning Net
    renderTab();
    await screen.findAllByText("Morning Net");
    const box = screen.getByRole("region", { name: "Coming up" });
    const rows = [...box.querySelectorAll(".net-coming-row")].map((r) => [
      r.querySelector(".net-coming-when")?.textContent,
      r.querySelector(".net-row-name")?.textContent,
    ]);
    // Tuesday's 19:00 net is more than 12 hours off.
    expect(rows).toEqual([["in 20 min", "Morning Net"]]);
  });

  it("leaves Coming up out when no net is on or within 12 hours", async () => {
    renderTab(); // Friday 09:00: the next net is Monday
    await screen.findAllByText("Morning Net");
    expect(screen.queryByRole("region", { name: "Coming up" })).not.toBeInTheDocument();
  });

  it("searches and filters by repeater (NETL-022)", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    await user.type(screen.getByLabelText("Search nets"), "147.000");
    expect(screen.getByText("SKYWARN Net")).toBeInTheDocument();
    expect(screen.queryByText("Tuesday Night Net")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search nets"));
    await user.selectOptions(screen.getByLabelText("Show nets on"), "r1");
    expect(screen.queryByText("SKYWARN Net")).not.toBeInTheDocument();
    expect(within(day("Thursday")).getByText("County ARES Net")).toBeInTheDocument();
  });

  it("starts an activity for the day it was started from, with the repeater (NETL-030)", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderTab(onStart);
    await screen.findAllByText("Morning Net");
    await unfold(user, "Tuesday");
    await unfold(user, "As needed");
    await user.click(within(rowIn(day("Tuesday"), "Tuesday Night Net")).getByRole("button", { name: /^Start activity for/ }));
    expect(onStart).toHaveBeenCalledWith({
      title: "Tuesday Night Net",
      activityType: "directed_net",
      date: "2026-10-06",
      time: "19:00",
      frequency: "146.940 -0.600 PL 100.0",
      repeater: { name: "W4ABC Orlando", lat: 28.54, lon: -81.38 },
    });
    // A daily net starts at its next meeting: Friday's is over, so Monday.
    await user.click(within(rowIn(day("Daily"), "Morning Net")).getByRole("button", { name: /^Start activity for/ }));
    expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-10-05" }));
    await user.click(within(rowIn(day("As needed"), "SKYWARN Net")).getByRole("button", { name: /^Start activity for/ }));
    expect(onStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ date: "2026-10-02", time: "", frequency: "147.000", repeater: null })
    );
  });

  it("deletes a net in use for good, once confirmed (NETL-012)", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    await user.click(within(day("Daily")).getByRole("button", { name: "Show details of Morning Net" }));
    await user.click(within(day("Daily")).getByRole("button", { name: "Delete Morning Net" }));
    const confirm = screen.getByRole("group", { name: "Delete Morning Net?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Delete Morning Net?" })).not.toBeInTheDocument();
    expect(api.deleteNetListing).not.toHaveBeenCalled();

    await user.click(within(day("Daily")).getByRole("button", { name: "Delete Morning Net" }));
    await user.click(
      within(screen.getByRole("group", { name: "Delete Morning Net?" })).getByRole("button", { name: "Delete" })
    );
    expect(api.deleteNetListing).toHaveBeenCalledWith("wkd", "op1");
  });

  it("edits a net listed under several days in one form", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    await user.click(within(day("Daily")).getByRole("button", { name: "Show details of Morning Net" }));
    await user.click(within(day("Daily")).getByRole("button", { name: "Edit Morning Net" }));
    expect(screen.getAllByRole("button", { name: "Save net" })).toHaveLength(1);
    expect(screen.getByLabelText("Net name")).toHaveValue("Morning Net");
    // It has who runs it, so its more details are open.
    expect(screen.getByLabelText("Run by")).toHaveValue("Orange County ARES");
  });

  it("adds a monthly net, refusing it until days and weeks are chosen (NETL-003, NETL-004, NETL-006)", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    await user.click(screen.getByRole("button", { name: "+ Add net" }));
    await user.type(screen.getByLabelText("Net name"), "Last Sunday Net");
    await user.selectOptions(screen.getByLabelText("Schedule"), "monthly");
    await user.click(screen.getByRole("button", { name: "Save net" }));
    expect(screen.getByText("Choose the day or days the net meets.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sun" }));
    await user.click(screen.getByRole("button", { name: "last" }));
    await user.type(screen.getByLabelText("Start time"), "14:00");
    await user.selectOptions(screen.getByLabelText("Repeater"), "r1");
    // The optional fields start folded away on a new net.
    expect(screen.queryByLabelText("Check-in instructions")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /More details/ }));
    await user.type(screen.getByLabelText("Check-in instructions"), "Call sign only");
    expect(screen.getByText("Last Sunday 14:00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save net" }));

    expect(api.saveNetListing).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        name: "Last Sunday Net",
        activity_type: "directed_net",
        checkin_info: "Call sign only",
        sessions: [
          expect.objectContaining({
            schedule_kind: "monthly",
            weekdays: [0],
            weeks: ["last"],
            start_time: "14:00",
            end_time: "",
            repeater_id: "r1",
          }),
        ],
      }),
      "op1"
    );
  });

  describe("time zones (NETL-040–048)", () => {
    // GhostNet meets Wednesdays 01:00 UTC: Tuesday 21:00 here in October (EDT).
    const GHOST = listing({ id: "ghost", name: "GhostNet", repeater_id: null, frequency: "7.107 JS8", time_zone: "UTC", weekdays: [3], start_time: "01:00", end_time: "" });

    beforeEach(() => {
      vi.mocked(api.listNetListings).mockImplementation((retired = false) =>
        Promise.resolve(retired ? [] : [...LISTINGS, GHOST])
      );
    });

    it("lists a UTC net under the weekday here, at both times, and starts it at the time here", async () => {
      const user = userEvent.setup();
      const onStart = vi.fn();
      renderTab(onStart);
      await screen.findAllByText("Morning Net");
      expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).not.toContain("Wednesday");
      await unfold(user, "Tuesday");
      const row = rowIn(day("Tuesday"), "GhostNet");
      expect(within(row).getByText("21:00 · 01:00Z")).toBeInTheDocument();

      await user.click(within(row).getByRole("button", { name: "Show details of GhostNet" }));
      expect(within(row).getByText("Wednesdays 01:00 UTC")).toBeInTheDocument();
      expect(within(row).getByText("Tue Oct 6, 21:00 EDT · Wed 01:00Z")).toBeInTheDocument();

      await user.click(within(row).getByRole("button", { name: "Start activity for GhostNet" }));
      expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-06", time: "21:00" }));
    });

    it("enters a net in Zulu as published, starting on Local (NETL-040, NETL-041)", async () => {
      const user = userEvent.setup();
      renderTab();
      await screen.findAllByText("Morning Net");
      await user.click(screen.getByRole("button", { name: "+ Add net" }));
      expect(screen.getByLabelText("Time zone")).toHaveDisplayValue("Local (America/New York)");
      await user.type(screen.getByLabelText("Net name"), "Zulu Net");
      await user.click(screen.getByRole("button", { name: "Wed" }));
      await user.type(screen.getByLabelText("Start time"), "01:00");
      await user.selectOptions(screen.getByLabelText("Time zone"), "UTC");
      expect(screen.getByLabelText("Time zone")).toHaveDisplayValue("Zulu (UTC)");
      expect(screen.getByLabelText("Start time")).toHaveValue("01:00");
      expect(screen.getByText("Wednesdays 01:00 UTC")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Save net" }));
      expect(api.saveNetListing).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          time_zone: "UTC",
          sessions: [expect.objectContaining({ weekdays: [3], start_time: "01:00" })],
        }),
        "op1"
      );
    });
  });

  describe("all day (NETL-004, NETL-028)", () => {
    const ALWAYS = listing({ id: "always", name: "SitRepNet", repeater_id: null, frequency: "7.078 JS8", time_zone: "UTC", all_day: true, weekdays: [0, 1, 2, 3, 4, 5, 6], start_time: "", end_time: "" });

    beforeEach(() => {
      vi.mocked(api.listNetListings).mockImplementation((retired = false) =>
        Promise.resolve(retired ? [] : [...LISTINGS, ALWAYS])
      );
    });

    it("shows All day first under Daily, unmarked, left out of Coming up, starting at the time now", async () => {
      const user = userEvent.setup();
      const onStart = vi.fn();
      renderTab(onStart);
      await screen.findAllByText("Morning Net");
      const rows = within(day("Daily")).getAllByText(/Net$|SitRepNet/);
      expect(rows[0]).toHaveTextContent("SitRepNet");
      const row = rowIn(day("Daily"), "SitRepNet");
      expect(within(row).getByText("All day")).toBeInTheDocument();
      expect(row).not.toHaveClass("net-row-underway");
      expect(row).not.toHaveClass("net-row-over");
      expect(screen.queryByRole("region", { name: "Coming up" })).not.toBeInTheDocument();

      await user.click(within(row).getByRole("button", { name: "Start activity for SitRepNet" }));
      expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-02", time: "09:00" }));
    });

    it("hides the times when All day is ticked, and saves none", async () => {
      const user = userEvent.setup();
      renderTab();
      await screen.findAllByText("Morning Net");
      await user.click(screen.getByRole("button", { name: "+ Add net" }));
      await user.type(screen.getByLabelText("Net name"), "Watch Net");
      await user.click(screen.getByRole("button", { name: "Sun" }));
      await user.type(screen.getByLabelText("Start time"), "07:00");
      await user.click(screen.getByRole("checkbox", { name: "All day" }));
      expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
      expect(screen.getByText("Sundays all day")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Save net" }));
      expect(api.saveNetListing).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          sessions: [expect.objectContaining({ all_day: true, start_time: "", end_time: "", weekdays: [0] })],
        }),
        "op1"
      );
    });
  });

  describe("sessions (NETL-002, NETL-008, NETL-009)", () => {
    // 4TX1: one net, 4.875 in summer and 3.299 in winter, daily at 20:00 UTC.
    const TX1: NetListing = {
      ...listing({ id: "tx1", name: "4TX1", time_zone: "UTC" }),
      sessions: [
        { repeater_id: null, frequency: "4.875 USB", schedule_kind: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], weeks: [], all_day: false, start_time: "20:00", end_time: "", season: "summer" },
        { repeater_id: null, frequency: "3.299 USB", schedule_kind: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], weeks: [], all_day: false, start_time: "20:00", end_time: "", season: "winter" },
      ],
    };

    beforeEach(() => {
      // Monday, November 16, 2026: winter.
      vi.setSystemTime(new Date(2026, 10, 16, 12, 0));
      vi.mocked(api.listNetListings).mockImplementation((retired = false) =>
        Promise.resolve(retired ? [] : [...LISTINGS, TX1])
      );
    });

    it("lists the session in season, its details giving every session", async () => {
      const user = userEvent.setup();
      renderTab();
      await screen.findAllByText("Morning Net");
      const row = rowIn(day("Daily"), "4TX1");
      expect(within(row).getByText("3.299 USB")).toBeInTheDocument();
      expect(screen.queryByText("4.875 USB")).not.toBeInTheDocument();
      await user.click(within(row).getByRole("button", { name: "Show details of 4TX1" }));
      expect(
        within(row).getByText(
          "Daily 20:00 UTC on 4.875 USB (Summer only · from Mar 14); Daily 20:00 UTC on 3.299 USB (Winter only)"
        )
      ).toBeInTheDocument();
    });

    it("adds a second session, which can be summer only, and removes it again", async () => {
      const user = userEvent.setup();
      renderTab();
      await screen.findAllByText("Morning Net");
      await user.click(screen.getByRole("button", { name: "+ Add net" }));
      // One session: no "Meets" headings, nor seasons.
      expect(screen.queryByText("Also meets")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Season")).not.toBeInTheDocument();
      await user.type(screen.getByLabelText("Net name"), "AmRRON Training");
      await user.type(screen.getByLabelText("Frequency"), "3.588");
      await user.click(screen.getByRole("button", { name: "Mon" }));
      await user.type(screen.getByLabelText("Start time"), "01:00");

      await user.click(screen.getByRole("button", { name: "+ Also meets on another frequency or day" }));
      expect(screen.getByText("Also meets")).toBeInTheDocument();
      // The new session starts as a copy of the last.
      expect(screen.getByLabelText("Start time (2nd schedule)")).toHaveValue("01:00");
      await user.clear(screen.getByLabelText("Frequency (2nd schedule)"));
      await user.type(screen.getByLabelText("Frequency (2nd schedule)"), "7.110");
      await user.selectOptions(screen.getByLabelText("Season (1st schedule)"), "winter");
      await user.selectOptions(screen.getByLabelText("Season (2nd schedule)"), "summer");
      await user.click(screen.getByRole("button", { name: "Save net" }));
      expect(api.saveNetListing).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          name: "AmRRON Training",
          sessions: [
            expect.objectContaining({ frequency: "3.588", season: "winter", weekdays: [1], start_time: "01:00" }),
            expect.objectContaining({ frequency: "7.110", season: "summer", weekdays: [1], start_time: "01:00" }),
          ],
        }),
        "op1"
      );
    });

    it("says which session is incomplete", async () => {
      const user = userEvent.setup();
      renderTab();
      await screen.findAllByText("Morning Net");
      await user.click(screen.getByRole("button", { name: "+ Add net" }));
      await user.type(screen.getByLabelText("Net name"), "Two Session Net");
      await user.click(screen.getByRole("button", { name: "Tue" }));
      await user.type(screen.getByLabelText("Start time"), "19:00");
      await user.click(screen.getByRole("button", { name: "+ Also meets on another frequency or day" }));
      await user.clear(screen.getByLabelText("Start time (2nd schedule)"));
      await user.click(screen.getByRole("button", { name: "Save net" }));
      expect(screen.getByText("2nd schedule: Enter the start time as HH:MM, for example 19:00.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Remove 2nd schedule" }));
      expect(screen.queryByText("Also meets")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Save net" }));
      expect(api.saveNetListing).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ sessions: [expect.objectContaining({ start_time: "19:00" })] }),
        "op1"
      );
    });
  });
});
