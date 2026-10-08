import type { NodeProps } from '@xyflow/react';
import './workflow-lesson.css';

export default function WorkflowLessonNode({ data }: NodeProps) {
  return (
    <article className="workflow-lesson">
      <div className="workflow-lesson-heading"><span>{String(data.step).padStart(2, '0')}</span><strong>{String(data.title)}</strong></div>
      <p>{String(data.body)}</p>
      <div className="workflow-lesson-exercise"><span>Попробуйте</span>{String(data.exercise)}</div>
    </article>
  );
}
