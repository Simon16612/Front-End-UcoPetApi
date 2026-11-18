import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgbPopover } from '@ng-bootstrap/ng-bootstrap';

import { Appointment } from '../../../models/appointment/appointment.model';
import { allowedActions, isExpired } from '../../../utils/appointment/appointment-actions';
import { statusIcon, statusLabel, timeLabel } from '../../../utils/appointment/appointment-labels';
import { todayIso } from '../../../utils/appointment/appointment-schedule';

export type CalendarView = 'day' | 'workweek' | 'week';

export type CalendarActionKind =
  | 'confirm'
  | 'complete'
  | 'cancel'
  | 'reactivate'
  | 'edit'
  | 'remove';

export interface CalendarAction {
  kind: CalendarActionKind;
  appointment: Appointment;
}

export interface CalendarSlot {
  date: string;
  time: string;
}

interface CalendarDay {
  iso: string;
  weekday: string;
  dayNumber: number;
  isToday: boolean;
  isPast: boolean;
}

interface PlacedAppointment {
  appointment: Appointment;
  top: number;
  height: number;
  left: number;
  width: number;
  tone: string;
}

const HOUR_PX = 64;
const SLOT_MINUTES = 30;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;
const SCROLL_TO_HOUR = 8;

@Component({
  selector: 'app-appointment-calendar',
  imports: [NgbPopover],
  templateUrl: './appointment-calendar.html',
  styleUrl: './appointment-calendar.scss',
})
export class AppointmentCalendar {
  readonly appointments = input<Appointment[]>([]);
  readonly processing = input<ReadonlySet<string>>(new Set());
  readonly showDoctor = input(false);
  readonly canRemove = input(false);

  readonly slot = output<CalendarSlot>();
  readonly action = output<CalendarAction>();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly view = signal<CalendarView>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'workweek',
  );
  protected readonly anchor = signal(startOfDay(new Date()));
  private readonly now = signal(new Date());

  protected readonly views: { value: CalendarView; label: string; icon: string }[] = [
    { value: 'day', label: 'Día', icon: 'bi-calendar-day' },
    { value: 'workweek', label: 'Semana laboral', icon: 'bi-calendar-week' },
    { value: 'week', label: 'Semana', icon: 'bi-calendar3-week' },
  ];

  protected readonly days = computed<CalendarDay[]>(() => {
    const anchor = this.anchor();
    const view = this.view();
    const today = todayIso(this.now());
    const first = view === 'day' ? anchor : startOfWeek(anchor);
    const count = view === 'day' ? 1 : view === 'workweek' ? 5 : 7;
    return Array.from({ length: count }, (_, index) => {
      const date = addDays(first, index);
      const iso = toIso(date);
      return {
        iso,
        weekday: new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(date),
        dayNumber: date.getDate(),
        isToday: iso === today,
        isPast: iso < today,
      };
    });
  });

  protected readonly rangeLabel = computed(() => {
    const days = this.days();
    const first = fromIso(days[0].iso);
    const last = fromIso(days[days.length - 1].iso);
    if (days.length === 1) {
      return new Intl.DateTimeFormat('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(first);
    }
    const sameMonth = first.getMonth() === last.getMonth();
    const month = (date: Date) =>
      new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(date);
    return sameMonth
      ? `${first.getDate()} – ${last.getDate()} de ${month(last)} de ${last.getFullYear()}`
      : `${first.getDate()} de ${month(first)} – ${last.getDate()} de ${month(last)} de ${last.getFullYear()}`;
  });

  private readonly inRange = computed(() => {
    const isos = new Set(this.days().map((day) => day.iso));
    return this.appointments().filter((appointment) => isos.has(appointment.appointmentDate));
  });

  protected readonly hours = computed(() => {
    let start = DEFAULT_START_HOUR;
    let end = DEFAULT_END_HOUR;
    for (const appointment of this.inRange()) {
      const minutes = toMinutes(appointment.appointmentTime);
      start = Math.min(start, Math.floor(minutes / 60));
      end = Math.max(end, Math.ceil((minutes + SLOT_MINUTES) / 60));
    }
    return Array.from({ length: end - start }, (_, index) => start + index);
  });

  protected readonly gridHeight = computed(() => this.hours().length * HOUR_PX);

  protected readonly placed = computed(() => {
    const startMinutes = this.hours()[0] * 60;
    const byDay = new Map<string, PlacedAppointment[]>();
    for (const day of this.days()) {
      const items = this.inRange()
        .filter((appointment) => appointment.appointmentDate === day.iso)
        .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime));
      byDay.set(day.iso, layout(items, startMinutes, (appointment) => this.tone(appointment)));
    }
    return byDay;
  });

  protected readonly nowTop = computed(() => {
    const now = this.now();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const hours = this.hours();
    const start = hours[0] * 60;
    const end = (hours[hours.length - 1] + 1) * 60;
    return minutes < start || minutes > end ? null : ((minutes - start) / 60) * HOUR_PX;
  });

  protected readonly counts = computed(() => {
    const active = this.inRange().filter(
      (appointment) => appointment.status === 'PENDING' || appointment.status === 'CONFIRMED',
    );
    return { total: this.inRange().length, active: active.length };
  });

  protected readonly hourPx = HOUR_PX;
  protected readonly timeLabel = timeLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusIcon = statusIcon;
  protected readonly allowedActions = allowedActions;
  protected readonly isExpired = isExpired;

  constructor() {
    afterNextRender(() => {
      const element = this.scroller()?.nativeElement;
      if (element) {
        const target = Math.max(SCROLL_TO_HOUR, new Date().getHours() - 1) - this.hours()[0];
        element.scrollTop = Math.max(0, target) * HOUR_PX;
      }
    });
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected setView(view: CalendarView): void {
    this.view.set(view);
  }

  protected today(): void {
    this.anchor.set(startOfDay(new Date()));
  }

  protected move(direction: 1 | -1): void {
    const step = this.view() === 'day' ? 1 : 7;
    this.anchor.update((date) => addDays(date, step * direction));
  }

  protected openDay(day: CalendarDay): void {
    this.anchor.set(fromIso(day.iso));
    this.view.set('day');
  }

  protected pickSlot(day: CalendarDay, event: MouseEvent): void {
    if (day.isPast) {
      return;
    }
    const column = event.currentTarget as HTMLElement;
    const offset = event.clientY - column.getBoundingClientRect().top;
    const minutes =
      this.hours()[0] * 60 + Math.floor(offset / (HOUR_PX / (60 / SLOT_MINUTES))) * SLOT_MINUTES;
    const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    const now = this.now();
    if (day.isToday && minutes < now.getHours() * 60 + now.getMinutes()) {
      return;
    }
    this.slot.emit({ date: day.iso, time });
  }

  protected run(kind: CalendarActionKind, appointment: Appointment, popover: NgbPopover): void {
    popover.close();
    this.action.emit({ kind, appointment });
  }

  protected isProcessing(id: string): boolean {
    return this.processing().has(id);
  }

  protected dateTitle(iso: string): string {
    return new Intl.DateTimeFormat('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(fromIso(iso));
  }

  private tone(appointment: Appointment): string {
    if (isExpired(appointment)) {
      return 'is-expired';
    }
    switch (appointment.status) {
      case 'PENDING':
        return 'is-pending';
      case 'CONFIRMED':
        return 'is-confirmed';
      case 'COMPLETED':
        return 'is-completed';
      default:
        return 'is-cancelled';
    }
  }
}

function layout(
  items: Appointment[],
  startMinutes: number,
  tone: (appointment: Appointment) => string,
): PlacedAppointment[] {
  const placed: PlacedAppointment[] = [];
  let cluster: { appointment: Appointment; start: number; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((item) => item.lane + 1));
    for (const item of cluster) {
      placed.push({
        appointment: item.appointment,
        top: ((item.start - startMinutes) / 60) * HOUR_PX,
        height: (SLOT_MINUTES / 60) * HOUR_PX - 2,
        left: (item.lane / lanes) * 100,
        width: 100 / lanes,
        tone: tone(item.appointment),
      });
    }
    cluster = [];
  };
  for (const appointment of items) {
    const start = toMinutes(appointment.appointmentTime);
    if (start >= clusterEnd && cluster.length > 0) {
      flush();
    }
    const busy = new Set(
      cluster.filter((item) => item.start + SLOT_MINUTES > start).map((item) => item.lane),
    );
    let lane = 0;
    while (busy.has(lane)) {
      lane++;
    }
    cluster.push({ appointment, start, lane });
    clusterEnd = Math.max(clusterEnd, start + SLOT_MINUTES);
  }
  if (cluster.length > 0) {
    flush();
  }
  return placed;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}
