import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'danger';

const STYLES: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white border-brand-700',
  secondary: 'bg-white text-brand-800 border-brand-700',
  danger: 'bg-missing text-white border-missing',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
}

export function Button({ variant = 'primary', icon, children, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 text-lg font-bold disabled:cursor-not-allowed disabled:opacity-50 ${STYLES[variant]} ${className}`}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
