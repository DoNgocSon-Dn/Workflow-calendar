import { Injectable, effect, signal } from '@angular/core';

export type Density = 'comfortable' | 'compact';

const STORAGE_KEY = 'density';

function readStoredDensity(): Density {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'compact' ? 'compact' : 'comfortable';
}

@Injectable({ providedIn: 'root' })
export class DensityService {
  readonly density = signal<Density>(readStoredDensity());

  constructor() {
    effect(() => {
      const density = this.density();
      document.documentElement.classList.toggle('density-compact', density === 'compact');
      localStorage.setItem(STORAGE_KEY, density);
    });
  }

  setDensity(density: Density): void {
    this.density.set(density);
  }
}
