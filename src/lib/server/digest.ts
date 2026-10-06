import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Garden, User } from "@/db/schema";
import type { PlanTask } from "@/lib/garden/types";
import { addDays, fmtDay } from "@/lib/garden/dates";
import { appUrl, buttonHtml, emailLayout, escapeHtml, sendEmail } from "./email";
import { doneTaskIds, listGardens } from "./gardens";
import { sign } from "./crypto";

// The weekly "here's what to do in your garden" email. This is Plantr's retention engine:
// it turns a one-time plan into a season-long habit.

export interface DigestGarden {
  garden: Garden;
  overdue: PlanTask[];
  upcoming: PlanTask[];
  seasonOver: boolean;
}

export function digestForGarden(garden: Garden, done: Set<string>, today: string): DigestGarden {
  const open = garden.plan.tasks.filter((t) => !done.has(t.id));
  const lastTask = garden.plan.tasks.at(-1)?.date ?? today;
  return {
    garden,
    overdue: open.filter((t) => t.date < today && t.date >= addDays(today, -14) && t.category !== "harvest"),
    upcoming: open.filter((t) => t.date >= today && t.date < addDays(today, 7)),
    seasonOver: lastTask < today && lastTask >= addDays(today, -21),
  };
}

export function unsubscribeUrl(userId: string): string {
  return `${appUrl()}/api/digest/unsubscribe?u=${encodeURIComponent(userId)}&sig=${sign(`digest:${userId}`)}`;
}

function taskLines(tasks: PlanTask[]): { html: string; text: string } {
  const html = tasks
    .map(
      (t) =>
        `<li style="margin:0 0 10px"><strong>${escapeHtml(t.title)}</strong><br><span style="color:#6b7280;font-size:14px">${escapeHtml(
          fmtDay(t.date),
        )}: ${escapeHtml(t.detail)}</span></li>`,
    )
    .join("");
  const text = tasks.map((t) => `- ${fmtDay(t.date)}: ${t.title}`).join("\n");
  return { html, text };
}

export function renderDigest(user: User, items: DigestGarden[]): { subject: string; html: string; text: string } | null {
  const active = items.filter((i) => i.upcoming.length || i.overdue.length || i.seasonOver);
  if (active.length === 0) return null;
  const count = active.reduce((n, i) => n + i.upcoming.length, 0);
  const subject =
    count > 0 ? `This week in your garden: ${count} thing${count === 1 ? "" : "s"} to do` : "Time to plan your next garden";

  let html = "";
  let text = "";
  for (const item of active) {
    const url = `${appUrl()}/garden/${item.garden.id}`;
    html += `<h2 style="font-size:18px;margin:20px 0 8px">${escapeHtml(item.garden.name)}</h2>`;
    text += `\n${item.garden.name}\n`;
    if (item.upcoming.length) {
      const lines = taskLines(item.upcoming.slice(0, 8));
      html += `<ul style="padding-left:18px;margin:0">${lines.html}</ul>`;
      text += `${lines.text}\n`;
    }
    if (item.overdue.length) {
      html += `<p style="color:#9a3412;font-size:14px;margin:6px 0">Still open from last week: ${item.overdue
        .slice(0, 4)
        .map((t) => escapeHtml(t.title))
        .join(", ")}</p>`;
      text += `Still open: ${item.overdue.map((t) => t.title).join(", ")}\n`;
    }
    if (item.seasonOver && !item.upcoming.length) {
      html += `<p>Your ${escapeHtml(item.garden.name.toLowerCase())} season is wrapping up. Nice work! Plan what comes next while it's fresh in your mind.</p>`;
      text += "Your season is wrapping up. Plan what comes next!\n";
    }
    html += `<p style="padding:8px 0 4px">${buttonHtml(item.seasonOver && !item.upcoming.length ? `${appUrl()}/plan/new` : url, item.seasonOver && !item.upcoming.length ? "Plan next season" : "Open my garden")}</p>`;
    text += `${url}\n`;
  }

  const unsub = unsubscribeUrl(user.id);
  return {
    subject,
    html: emailLayout(
      "Your week in the garden",
      html,
      `You're getting this because you saved a garden on Plantr. <a href="${escapeHtml(unsub)}" style="color:#6b7280">Unsubscribe from weekly emails</a>.`,
    ),
    text: `Your week in the garden\n${text}\nUnsubscribe: ${unsub}`,
  };
}

export async function sendWeeklyDigests(today: string): Promise<{ sent: number; skipped: number; failed: number }> {
  const db = getDb();
  const users = await db.select().from(schema.users).where(eq(schema.users.digest, true));
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    // Idempotent: a retried cron run in the same week won't email twice.
    if (user.lastDigestAt && user.lastDigestAt > addDays(today, -5)) {
      skipped++;
      continue;
    }
    const gardens = (await listGardens(user.id)).filter((g) => g.status === "active");
    if (gardens.length === 0) {
      skipped++;
      continue;
    }
    const done = await doneTaskIds(gardens.map((g) => g.id));
    const items = gardens.map((g) => digestForGarden(g, done.get(g.id) ?? new Set(), today));
    const email = renderDigest(user, items);
    if (!email) {
      skipped++;
      continue;
    }
    const ok = await sendEmail({
      to: user.email,
      ...email,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl(user.id)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (ok) {
      sent++;
      await db.update(schema.users).set({ lastDigestAt: today }).where(eq(schema.users.id, user.id));
    } else {
      failed++;
    }
  }
  return { sent, skipped, failed };
}
