import { describe, it, expect } from "vitest";
import { splitCsv, parseOrdersCsv, parseLocalDate, calibrationScale, baselineOrdersPerNight } from "../csv";

describe("splitCsv", () => {
  it("handles quoted commas, doubled quotes, CRLF and empty lines", () => {
    const text = 'a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n2,plain,\n\n';
    expect(splitCsv(text)).toEqual([["a", "b", "c"], ["1", "x, y", 'say "hi"'], ["2", "plain", ""]]);
  });
  it("keeps newlines inside quoted fields", () => {
    expect(splitCsv('h1,h2\n"line1\nline2",v')).toEqual([["h1", "h2"], ["line1\nline2", "v"]]);
  });
  it("strips a BOM", () => {
    expect(splitCsv("﻿Date,Item\n2026-10-17,Fries")[0]).toEqual(["Date", "Item"]);
  });
});

describe("parseLocalDate", () => {
  it("reads ISO, US and textual dates as local dates", () => {
    expect(parseLocalDate("2026-10-16")?.getDay()).toBe(5); // Friday, no UTC shift
    expect(parseLocalDate("10/16/2026", "6:42 PM")?.getHours()).toBe(18);
    expect(parseLocalDate("2026-10-16 18:05:00")?.getMinutes()).toBe(5);
    expect(parseLocalDate("Oct 16, 2026 7:15 PM")?.getHours()).toBe(19);
    expect(parseLocalDate("not a date")).toBeNull();
    expect(parseLocalDate("")).toBeNull();
  });
});

describe("parseOrdersCsv", () => {
  // 2026-10-16 is a Friday, 2026-10-17 a Saturday, 2026-10-23 a Friday.
  const square = [
    "Date,Time,Order ID,Item,Qty,Gross Sales,Channel",
    "2026-10-16,17:02:00,A1,Double burger,1,$11.50,DoorDash",
    "2026-10-16,17:02:00,A1,Fries,2,$7.00,DoorDash",
    "2026-10-16,18:10:00,A2,\"Wings, 10 pc\",1,$13.00,Counter",
    "",
    "2026-10-17,19:00:00,B1,Fries,1,$3.50,Uber Eats",
    "2026-10-23,20:15:00,C1,Double burger,1,$11.50,Phone",
    "2026-10-23,20:30:00,C2,Double burger,1,$11.50,Phone",
    "2026-10-23,20:45:00,C3,Fries,1,$3.50,Phone",
    "",
  ].join("\n");

  it("groups line items by order id and reads dates, Fridays and top items", () => {
    const r = parseOrdersCsv(square);
    expect(r.error).toBeUndefined();
    const s = r.summary!;
    expect(s.orders).toBe(6);
    expect(s.from).toBe("2026-10-16");
    expect(s.to).toBe("2026-10-23");
    expect(s.avgPerDay).toBe(2);          // 6 orders over 3 days with orders
    expect(s.avgFriday).toBe(2.5);        // (2 + 3) / 2 Fridays
    expect(s.topItems[0]).toEqual({ name: "Fries", count: 4 });
    expect(s.topItems[1]).toEqual({ name: "Double burger", count: 3 });
    expect(s.topItems[2]).toEqual({ name: "Wings, 10 pc", count: 1 });
    expect(r.columns.date).toBe("Date");
    expect(r.columns.item).toBe("Item");
  });

  it("detects columns regardless of order and header wording (Toast-style, one row per order)", () => {
    const toast = [
      "Total Amount,Product Name,Source,Created At,Quantity",
      "22.00,Cheeseburger; Fries,Online,10/16/2026 6:30 PM,1",
      "9.00,\"Shake, vanilla\",In-store,10/16/2026 7:00 PM,2",
      "13.00,Wings x 2,DoorDash,10/17/2026 8:00 PM,1",
    ].join("\r\n");
    const r = parseOrdersCsv(toast);
    expect(r.error).toBeUndefined();
    const s = r.summary!;
    expect(s.orders).toBe(3);             // no order-id column: a row is an order
    expect(s.avgFriday).toBe(2);
    expect(s.avgPerDay).toBe(1.5);
    expect(s.topItems.map(t => t.name)).toEqual(["Shake, vanilla", "Wings", "Cheeseburger", "Fries"]);
    expect(s.topItems.find(t => t.name === "Shake, vanilla")?.count).toBe(2);
    expect(s.topItems.find(t => t.name === "Wings")?.count).toBe(2);
    expect(r.columns.date).toBe("Created At");
    expect(r.columns.total).toBe("Total Amount");
    expect(r.columns.channel).toBe("Source");
  });

  it("skips rows without a readable date and reports them", () => {
    const text = "Order Date,Item\n2026-10-16,Fries\nTOTAL,\n2026-10-17,Fries\n";
    const r = parseOrdersCsv(text);
    expect(r.summary?.orders).toBe(2);
    expect(r.summary?.skipped).toBe(1);
  });

  it("errors clearly when there is no date column or no data", () => {
    expect(parseOrdersCsv("Item,Qty\nFries,1").error).toMatch(/date column/);
    expect(parseOrdersCsv("Date,Item\n").error).toMatch(/no data/);
    expect(parseOrdersCsv("").summary).toBeNull();
  });
});

describe("calibrationScale", () => {
  const base = { orders: 0, from: "", to: "", avgPerDay: 100, avgFriday: 123, topItems: [] };
  it("is avgFriday / baseline, clamped to 0.5..2", () => {
    expect(calibrationScale(base, 100)).toBe(1.23);
    expect(calibrationScale({ ...base, avgFriday: 10 }, 100)).toBe(0.5);
    expect(calibrationScale({ ...base, avgFriday: 900 }, 100)).toBe(2);
  });
  it("falls back to the daily average without Fridays and to 1 without a baseline", () => {
    expect(calibrationScale({ ...base, avgFriday: 0, avgPerDay: 150 }, 100)).toBe(1.5);
    expect(calibrationScale(base, 0)).toBe(1);
  });
  it("sums 15-minute bins of orders/hour into orders per night", () => {
    expect(baselineOrdersPerNight(Array(24).fill(20))).toBe(120);
  });
});
