import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'taxintel.signedIn';

/**
 * Sign-in state. Dummy for now: there is no backend login yet, signing in just
 * flips a flag (remembered per device). Replace with a real login call later.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly signedIn = signal(readStoredState());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, String(this.signedIn()));
      } catch {
        // storage unavailable: state only lasts for this visit
      }
    });
  }

  signIn(): void {
    this.signedIn.set(true);
  }

  signOut(): void {
    this.signedIn.set(false);
  }
}

function readStoredState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}
