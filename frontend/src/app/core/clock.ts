
import { Injectable } from '@angular/core';

/**
 * Wraps `new Date()` behind DI so components never call it directly,
 * keeping "today" swappable/mockable in tests.
 */
@Injectable({ providedIn: 'root' })
export class Clock {
  now(): Date {
    return new Date();
  }
}
