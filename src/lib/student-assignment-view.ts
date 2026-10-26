type StudentAssignment = {
  status: 'pending' | 'submitted' | 'done' | 'revision';
  visibility?: string;
  videoJob?: {status: string; retryable?: boolean} | null;
};

function videoIsActive(job: StudentAssignment['videoJob']) {
  return !!job && (job.status === 'queued' || job.status === 'processing' || (job.status === 'failed' && !!job.retryable));
}

/** An omitted active job may belong to a newly hidden task; reconcile through home. */
export function missingActiveVideoJobIds(
  assignments: readonly {id: string; videoJob?: {id: string; status: string; retryable?: boolean} | null}[],
  jobs: readonly {assignmentId: string}[],
) {
  const returned = new Set(jobs.map(job => job.assignmentId));
  return assignments.filter(task => videoIsActive(task.videoJob) && !returned.has(task.id)).map(task => task.videoJob!.id);
}

/** Suppress repeated home reads for the same missing job while a network error persists. */
export function videoReconciliationDue(jobIds: readonly string[], lastAttempts: ReadonlyMap<string, number>, now: number) {
  return jobIds.filter(id => !lastAttempts.has(id) || now - lastAttempts.get(id)! >= 30_000);
}

/** Every visible task appears once, with actionable homework first. */
export function studentAssignmentSections<T extends StudentAssignment>(assignments: readonly T[]) {
  const todo: T[] = [], history: T[] = [];
  for (const assignment of assignments) {
    if (assignment.visibility === 'hidden') continue;
    const processingVideo = videoIsActive(assignment.videoJob);
    if ((assignment.status === 'pending' || assignment.status === 'revision') && !processingVideo) todo.push(assignment);
    else history.push(assignment);
  }
  return {todo, history};
}
