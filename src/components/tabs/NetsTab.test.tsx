import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetListing, Repeater } from "../../types";

vi.mock("../../api", () => ({
  listNetListings: vi.fn(),
  listRepeaters: vi.fn(),
  saveNetListing: vi.fn(() => Promise.resolve("n9")),
  setNetListingRetired: vi.fn(() => Promise.resolve()),
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

function listing(overrides: Partial<NetListing>): NetListing {
  return {
    id: "n1",
    name: "Tuesday Night Net",
    activity_type: "directed_net",
    repeater_id: "r1",
    frequency: "",
    schedule_kind: "weekly",
    weekdays: [2],
    weeks: [],
    start_time: "19:00",
    end_time: "19:30",
    checkin_info: "",
    run_by: "Orange County ARES",
    notes: "",
    retired_at: "",
    ...overrides,
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

  it("edits a net listed under several days in one form", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    await user.click(within(day("Daily")).getByRole("button", { name: "Show details of Morning Net" }));
    await user.click(within(day("Daily")).getByRole("button", { name: "Edit Morning Net" }));
    expect(screen.getAllByRole("button", { name: "Save net" })).toHaveLength(1);
    expect(screen.getByLabelText("Net name")).toHaveValue("Morning Net");
  });

  it("adds a monthly net, refusing it until days and weeks are chosen (NETL-003, NETL-004, NETL-006)", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findAllByText("Morning Net");
    await user.click(screen.getByRole("button", { name: "+ Add net" }));
    await user.type(screen.getByLabelText("Net name"), "Last Sunday Net");
    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    await user.click(screen.getByRole("button", { name: "Save net" }));
    expect(screen.getByText("Choose the day or days the net meets.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sun" }));
    await user.click(screen.getByRole("button", { name: "last" }));
    await user.type(screen.getByLabelText("Start time"), "14:00");
    await user.selectOptions(screen.getByLabelText("Repeater"), "r1");
    await user.type(screen.getByLabelText("Check-in instructions"), "Call sign only");
    expect(screen.getByText("Last Sunday 14:00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save net" }));

    expect(api.saveNetListing).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        name: "Last Sunday Net",
        activity_type: "directed_net",
        schedule_kind: "monthly",
        weekdays: [0],
        weeks: ["last"],
        start_time: "14:00",
        end_time: "",
        repeater_id: "r1",
        checkin_info: "Call sign only",
      }),
      "op1"
    );
  });
});
