import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Task } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2 } from 'lucide-react'
import { TaskRowActions } from '@/components/event/task-row-actions'

interface PageProps {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ filter?: string }>
}

export default async function TasksPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const { filter } = await searchParams
  const supabase = await createClient()

  const statusFilter = filter === 'done' ? 'done' : filter === 'all' ? undefined : 'todo'

  const [{ data: event }, { data: tasks }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    (() => {
      const q = supabase.from('tasks').select('*').eq('event_id', eventId).order('created_at')
      return statusFilter ? q.eq('status', statusFilter) : q
    })(),
  ])

  if (!event) notFound()

  const taskList = (tasks ?? []) as Task[]
  const activeFilter = filter === 'done' ? 'done' : filter === 'all' ? 'all' : 'open'

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{taskList.length} task{taskList.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
          {(['open', 'done', 'all'] as const).map((f) => (
            <a
              key={f}
              href={f === 'open' ? `?` : `?filter=${f}`}
              className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                activeFilter === f
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f}
            </a>
          ))}
        </div>
      </div>

      {taskList.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">
            {activeFilter === 'done' ? 'No completed tasks yet.' : 'No tasks yet. Tell Glenn what needs to get done.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {taskList.map((task) => (
            <div key={task.id} className="flex items-start gap-3 rounded-lg border bg-card p-3.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0px_1px_4px_rgba(0,0,0,0.08)] transition-shadow">
              <TaskRowActions taskId={task.id} eventId={eventId} currentStatus={task.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium tracking-tight ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </p>
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium capitalize
                    ${task.priority === 'high' ? 'bg-rose-50 text-rose-700' :
                      task.priority === 'medium' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-500'}`}>
                    {task.priority}
                  </span>
                  {task.ai_generated && (
                    <Badge variant="outline" className="text-xs">AI</Badge>
                  )}
                </div>
                {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                {task.due_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
