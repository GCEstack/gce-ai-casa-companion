import { useNavigate } from 'react-router';

const STORAGE_KEY = 'casa_has_onboarded';

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function goToPietroWithOnboardingPath(): string {
  return '/character/pietro?onboard=true';
}

export function useOnboarding() {
  const navigate = useNavigate();

  const goToPietroWithOnboarding = () => {
    navigate(goToPietroWithOnboardingPath());
  };

  return {
    hasOnboarded,
    markOnboarded,
    resetOnboarding,
    goToPietroWithOnboarding,
  };
}
