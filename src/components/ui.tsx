import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { haptic } from '../tg';

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[20px] border border-line bg-card p-4 ${onClick ? 'cursor-pointer transition active:scale-[0.98]' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' };

export function Button({ variant = 'primary', className = '', onClick, ...rest }: BtnProps) {
  const styles = {
    primary: 'bg-accent text-black font-bold glow',
    soft: 'bg-card2 text-fg border border-line',
    ghost: 'text-muted',
    danger: 'bg-danger/15 text-danger',
  }[variant];
  return (
    <button
      {...rest}
      onClick={(e) => {
        haptic.tap();
        onClick?.(e);
      }}
      className={`rounded-2xl px-4 py-3 text-[15px] transition active:scale-[0.97] disabled:opacity-40 ${styles} ${className}`}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-line bg-card2 px-3 py-2.5 text-fg outline-none placeholder:text-muted/60 focus:border-accent/60 ${props.className ?? ''}`}
    />
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 pt-2">
      <div className="min-w-0">
        {subtitle && <div className="text-[13px] font-semibold uppercase tracking-wider text-muted">{subtitle}</div>}
        <h1 className="truncate text-[28px] font-extrabold leading-tight">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="fade-up flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-card2 text-3xl">{icon}</div>
      <div className="mb-1 text-lg font-bold">{title}</div>
      <div className="mb-6 max-w-[280px] text-sm text-muted">{text}</div>
      {action}
    </div>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="rounded-2xl bg-card2 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="num mt-1 text-xl font-extrabold">
        {value}
        {unit && <span className="ml-0.5 text-sm font-semibold text-muted">{unit}</span>}
      </div>
    </div>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={() => {
        haptic.select();
        onClick?.();
      }}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-accent text-black' : 'border border-line bg-card text-muted'
      }`}
    >
      {children}
    </button>
  );
}
