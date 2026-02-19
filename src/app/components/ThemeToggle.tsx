import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { Button } from './ui/button';

export function ThemeToggle() {
  const { theme, toggleTheme, isDark, isLight } = useTheme();

  const getIcon = () => {
    return isDark ? <Sun className="size-4" /> : <Moon className="size-4" />;
  };

  const getLabel = () => {
    return isDark ? 'Light' : 'Dark';
  };

  const getNextThemeLabel = () => {
    return isDark ? 'Switch to Light' : 'Switch to Dark';
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="flex items-center gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      title={`${getNextThemeLabel()} (Current: ${getLabel()})`}
    >
      {getIcon()}
      <span className="hidden sm:inline text-sm">
        {getLabel()}
      </span>
    </Button>
  );
}
