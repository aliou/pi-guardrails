export interface OnboardingState {
  applyBuiltinDefaults: boolean | null;
  pathAccessEnabled: boolean | null;
}

export interface OnboardingResult {
  completed: boolean;
  applyBuiltinDefaults: boolean | null;
  pathAccessEnabled: boolean | null;
}
