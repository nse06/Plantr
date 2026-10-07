import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/server/auth";
import { doneTaskIds, listGardens } from "@/lib/server/gardens";
import { fmtShort, todayISO } from "@/lib/garden/dates";
import { isOverdue, nextTask, progress, weekTasks } from "@/lib/garden/progress";
import { WeekList, type WeekItem } from "@/components/garden/WeekList";
import { ButtonLink, Card, Chip, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "My Garden" };

export default async function GardenDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/garden");
  const gardens = await listGardens(user.id);
  const done = await doneTaskIds(gardens.map((g) => g.id));
  const today = todayISO();
  const active = gardens.filter((g) => g.status === "active");
  const archived = gardens.filter((g) => g.status === "archived");

  const week: WeekItem[] = active
    .flatMap((g) => {
      const d = done.get(g.id) ?? new Set<string>();
      return weekTasks(g.plan, d, today).map((task) => ({
        gardenId: g.id,
        gardenName: g.name,
        task,
        done: d.has(task.id),
        overdue: isOverdue(task, today),
      }));
    })
    .sort((a, b) => a.task.date.localeCompare(b.task.date));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-leaf-700">Welcome back 🌤️</p>
          <h1 className="font-display text-4xl font-semibold">My Garden</h1>
        </div>
        <ButtonLink href="/plan/new" variant="secondary">
          <Plus className="h-4 w-4" /> New plan
        </ButtonLink>
      </div>

      {gardens.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon="🪴" title="No saved gardens yet">
            Make a plan in about two minutes, then save it here for weekly to-dos, reminders and a harvest log.
            <div className="mt-5">
              <ButtonLink href="/plan/new">
                Plan my garden <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <section>
            <h2 className="mb-3 font-display text-2xl font-semibold">This week</h2>
            {week.length ? (
              <WeekList items={week} showGarden={active.length > 1} />
            ) : (
              <Card className="p-6 text-muted">Nothing due this week. Enjoy the garden! 🌻</Card>
            )}
          </section>
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">Your gardens</h2>
            {active.map((g) => {
              const d = done.get(g.id) ?? new Set<string>();
              const p = progress(g.plan, d, today);
              const next = nextTask(g.plan, d, today);
              const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
              return (
                <Link key={g.id} href={`/garden/${g.id}`} className="block transition-transform hover:-translate-y-0.5">
                  <Card className="overflow-hidden">
                    <div className="flex gap-3 p-4">
                      {g.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small data-URL thumbnail
                        <img src={g.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-leaf-100 text-2xl">🌱</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-lg font-semibold">{g.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Chip>{g.season === "indoor" ? "🪟 Indoors" : `Zone ${g.zone}`}</Chip>
                          <Chip tone="neutral">{g.plan.plants.length} crops</Chip>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-line px-4 py-3">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>{pct}% of the season&apos;s tasks done</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-leaf-500" style={{ width: `${pct}%` }} />
                      </div>
                      {next && (
                        <p className="mt-2 truncate text-sm">
                          <span className="text-muted">Next · {fmtShort(next.date)}:</span> <span className="font-medium">{next.title}</span>
                        </p>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
            {archived.length > 0 && (
              <details className="rounded-2xl border border-line bg-paper px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-muted">Past seasons ({archived.length})</summary>
                <ul className="mt-2 space-y-1.5">
                  {archived.map((g) => (
                    <li key={g.id}>
                      <Link href={`/garden/${g.id}`} className="text-sm font-medium text-leaf-700 hover:underline">
                        {g.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
