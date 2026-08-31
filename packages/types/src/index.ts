export type { Database, Json, TablesUpdate } from './database.types';
export * from './result';

// Domain entity types are inferred from the Zod schemas so that runtime
// validation and compile-time types can never drift apart.
export type {
  Calendar,
  CalendarEvent,
  CalendarSyncHealth,
  CreateCalendarInput,
  CreateEventInput,
  CreateTaskInput,
  CreateTaskListInput,
  EventStatus,
  ExternalCalendar,
  HourCycle,
  Profile,
  ProviderAccount,
  ProviderKind,
  ProviderStatus,
  ScheduleConstraints,
  SourceType,
  SyncStatus,
  Tag,
  Task,
  TaskList,
  TaskPriority,
  TaskStatus,
  TimeSlot,
  UpdateEventInput,
  UpdateProfileInput,
  UpdateTaskInput,
  WorkingHours,
  WorkingWindow,
} from '@cal/schemas';
