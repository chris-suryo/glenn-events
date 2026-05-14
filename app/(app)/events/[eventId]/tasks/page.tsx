import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Task } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle } from 'lucide-react'

interface PageProps {
  params: Promise<{ eventId: string }>
}

const priorityVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
}

export default async function TasksPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: tasks }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    supabase.from('tasks').select('*').eq('event_id', eventId).order('created_at'),
  ])

  if (!event) notFound()

  const taskList = (tasks ?? []) as Task[]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Tasks</h2>
        <p className="text-sm text-muted-foreground">{taskList.length} task{taskList.length !== 1 ? 's' : ''}</p>
      </div>

      {taskList.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No tasks yet. Tell Glenn what needs to get done.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {taskList.map((task) => (
            <div key={task.id} className="flex items-start gap-3 rounded-lg border p-3.5">
              {task.status === 'done'
                ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                : <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </p>
                  <Badge variant={priorityVariant[task.priority] ?? 'secondary'} className="text-xs capitalize">
                    {task.priority}
                  </Badge>
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
