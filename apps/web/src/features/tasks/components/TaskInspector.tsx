import { DURATION_PRESETS, PRIORITY_LABELS, getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { CreateTaskInput, Tag, TaskList, TaskPriority, UpdateTaskInput } from '@cal/schemas';
import React, { useEffect, useState } from 'react';

import styles from './TaskInspector.module.css';
import type { TaskWithTags } from '../api/tasks.api';

interface TaskInspectorProps {
  task: TaskWithTags | null;
  isDraft: boolean;
  lists?: TaskList[];
  tags?: Tag[];
  timeZone: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: CreateTaskInput | UpdateTaskInput) => Promise<void> | void;
  onToggleComplete?: (task: TaskWithTags, completed: boolean) => void;
  onSnooze?: (task: TaskWithTags) => void;
  onDelete?: (task: TaskWithTags) => void;
}

export function TaskInspector({
  task,
  isDraft,
  lists = [],
  tags = [],
  timeZone,
  isSaving,
  onClose,
  onSave,
  onToggleComplete,
  onSnooze,
  onDelete,
}: TaskInspectorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [hasDueTime, setHasDueTime] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [isFlexible, setIsFlexible] = useState(true);
  const [listId, setListId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state with selected task or draft
  useEffect(() => {
    setErrorMessage(null);
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setPriority(task.priority);
      setIsFlexible(task.isFlexible);
      setListId(task.listId);
      setEstimatedMinutes(task.estimatedMinutes);
      setSelectedTagIds(task.tagIds ?? []);

      if (task.dueAt) {
        const parts = getZonedParts(new Date(task.dueAt), timeZone);
        const yyyy = String(parts.year);
        const mm = String(parts.month).padStart(2, '0');
        const dd = String(parts.day).padStart(2, '0');
        setDueDate(`${yyyy}-${mm}-${dd}`);

        if (task.hasDueTime) {
          const hh = String(parts.hour).padStart(2, '0');
          const min = String(parts.minute).padStart(2, '0');
          setDueTime(`${hh}:${min}`);
          setHasDueTime(true);
        } else {
          setDueTime('');
          setHasDueTime(false);
        }
      } else {
        setDueDate('');
        setDueTime('');
        setHasDueTime(false);
      }
    } else if (isDraft) {
      setTitle('');
      setDescription('');
      setPriority('normal');
      setDueDate('');
      setDueTime('');
      setHasDueTime(false);
      setEstimatedMinutes(null);
      setIsFlexible(true);
      setListId(null);
      setSelectedTagIds([]);
    }
  }, [task, isDraft, timeZone]);

  if (!task && !isDraft) {
    return (
      <aside className={styles.inspector}>
        <div className={styles.emptyState}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p>Select a task to view details or create a new one.</p>
        </div>
      </aside>
    );
  }

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleClearDue = () => {
    setDueDate('');
    setDueTime('');
    setHasDueTime(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Please enter a task title.');
      return;
    }

    let dueAtIso: string | null = null;
    if (dueDate) {
      const dateParts = dueDate.split('-').map(Number);
      const year = dateParts[0] ?? 2026;
      const month = dateParts[1] ?? 1;
      const day = dateParts[2] ?? 1;
      let hour = 12;
      let minute = 0;
      if (hasDueTime && dueTime) {
        const timeParts = dueTime.split(':').map(Number);
        hour = timeParts[0] ?? 12;
        minute = timeParts[1] ?? 0;
      }

      dueAtIso = zonedWallClockToUtc({ year, month, day, hour, minute }, timeZone).toISOString();
    }

    try {
      setErrorMessage(null);
      if (isDraft) {
        const input: CreateTaskInput = {
          title: trimmedTitle,
          description: description.trim() || null,
          priority,
          dueAt: dueAtIso,
          hasDueTime: !!(dueAtIso && hasDueTime),
          estimatedMinutes,
          isFlexible,
          listId: listId || null,
          tagIds: selectedTagIds,
        };
        await onSave(input);
      } else if (task) {
        const input: UpdateTaskInput = {
          id: task.id,
          title: trimmedTitle,
          description: description.trim() || null,
          priority,
          dueAt: dueAtIso,
          hasDueTime: !!(dueAtIso && hasDueTime),
          estimatedMinutes,
          isFlexible,
          listId: listId || null,
          tagIds: selectedTagIds,
        };
        await onSave(input);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save task.');
    }
  };

  const isCompleted = task?.status === 'completed';

  return (
    <aside className={styles.inspector} aria-label="Task inspector">
      <div className={styles.header}>
        <span className={styles.headerTitle}>{isDraft ? 'New Task' : 'Task Details'}</span>

        <div className={styles.headerActions}>
          {task && onToggleComplete && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => onToggleComplete(task, !isCompleted)}
              title={isCompleted ? 'Mark open' : 'Mark complete'}
              aria-label={isCompleted ? 'Mark open' : 'Mark complete'}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          )}

          {task && onSnooze && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => onSnooze(task)}
              title="Snooze to tomorrow"
              aria-label="Snooze to tomorrow"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          )}

          {task && onDelete && (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
              onClick={() => onDelete(task)}
              title="Delete task"
              aria-label="Delete task"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}

          <button
            type="button"
            className={styles.iconBtn}
            onClick={onClose}
            title="Close inspector"
            aria-label="Close inspector"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className={styles.body}>
        {errorMessage && <div className={styles.errorBanner}>{errorMessage}</div>}

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="task-title">
            Title
          </label>
          <input
            id="task-title"
            type="text"
            className={styles.titleInput}
            value={title}
            placeholder="What needs to be done?"
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="task-desc">
            Notes / Description
          </label>
          <textarea
            id="task-desc"
            className={styles.descriptionInput}
            value={description}
            placeholder="Add context, links, or notes..."
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <label className={styles.fieldLabel}>Due Date &amp; Time</label>
            {dueDate && (
              <button type="button" className={styles.clearFieldBtn} onClick={handleClearDue}>
                Clear
              </button>
            )}
          </div>
          <div className={styles.dateTimeRow}>
            <input
              type="date"
              className={styles.dateInput}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            {dueDate && (
              <label className={styles.timeToggle}>
                <input
                  type="checkbox"
                  checked={hasDueTime}
                  onChange={(e) => setHasDueTime(e.target.checked)}
                />
                <span>Time</span>
              </label>
            )}
            {dueDate && hasDueTime && (
              <input
                type="time"
                className={styles.timeInput}
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <label className={styles.fieldLabel}>Estimated Duration</label>
            {estimatedMinutes !== null && (
              <button
                type="button"
                className={styles.clearFieldBtn}
                onClick={() => setEstimatedMinutes(null)}
              >
                Clear
              </button>
            )}
          </div>
          <div className={styles.presetsGrid}>
            {DURATION_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`${styles.presetBtn} ${estimatedMinutes === minutes ? styles.presetBtnActive : ''}`}
                onClick={() => setEstimatedMinutes(minutes)}
              >
                {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="task-priority">
            Priority
          </label>
          <select
            id="task-priority"
            className={styles.selectInput}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="task-list">
            List
          </label>
          <select
            id="task-list"
            className={styles.selectInput}
            value={listId ?? ''}
            onChange={(e) => setListId(e.target.value ? e.target.value : null)}
          >
            <option value="">Inbox (No List)</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {tags.length > 0 && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Tags</label>
            <div className={styles.tagsGrid}>
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`${styles.tagChip} ${isSelected ? styles.tagChipSelected : ''}`}
                    onClick={() => handleTagToggle(tag.id)}
                  >
                    <span className={styles.tagDot} style={{ backgroundColor: tag.color }} />
                    <span>{tag.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.fieldGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isFlexible}
              onChange={(e) => setIsFlexible(e.target.checked)}
            />
            <span>Flexible for AI scheduling</span>
          </label>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className={styles.saveBtn} disabled={isSaving || !title.trim()}>
            {isSaving ? 'Saving...' : isDraft ? 'Create Task' : 'Save Changes'}
          </button>
        </div>
      </form>
    </aside>
  );
}
