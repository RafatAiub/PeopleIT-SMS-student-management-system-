/**
 * Template gallery thumbnail: an SVG wireframe in the template's own
 * colours over its gradient. No external images.
 */
import type { SiteTemplate } from './types';
import { readableTextOn } from '../theme';

export function TemplateThumbnail({ template, className = '' }: { template: SiteTemplate; className?: string }) {
  const { primary, accent } = template.theme;
  const r = { none: 0, sm: 2, md: 4, lg: 6, xl: 10 }[template.theme.radius] ?? 4;
  const onPrimary = readableTextOn(primary);
  const light = '#ffffff';
  const line = (x: number, y: number, w: number, fill = light, o = 0.9) => <rect x={x} y={y} width={w} height={5} rx={2.5} fill={fill} opacity={o} />;

  const nav = (
    <g>
      <rect x="0" y="0" width="240" height="18" fill={light} opacity=".96" />
      <circle cx="12" cy="9" r="5" fill={primary} />
      {[150, 170, 190, 210].map((x) => <rect key={x} x={x} y="7" width="14" height="4" rx="2" fill="#94a3b8" />)}
    </g>
  );

  const cards = (y: number, n = 3, fill = light) => {
    const w = (216 - (n - 1) * 8) / n;
    return Array.from({ length: n }, (_, i) => (
      <g key={i}>
        <rect x={12 + i * (w + 8)} y={y} width={w} height={34} rx={r} fill={fill} opacity=".95" />
        <rect x={18 + i * (w + 8)} y={y + 6} width={10} height={10} rx={Math.min(r, 3)} fill={accent} />
        <rect x={18 + i * (w + 8)} y={y + 21} width={w - 16} height={4} rx="2" fill="#cbd5e1" />
      </g>
    ));
  };

  let body: JSX.Element;
  switch (template.preview.layout) {
    case 'portal-banner':
      body = (
        <g>
          <rect x="0" y="18" width="240" height="10" fill={primary} opacity=".9" />
          <rect x="0" y="28" width="240" height="34" fill={primary} opacity=".75" />
          <circle cx="120" cy="45" r="11" fill={light} opacity=".9" />
          <rect x="0" y="62" width="240" height="12" fill={light} opacity=".95" />
          <circle cx="12" cy="68" r="5" fill={accent} />
          {[40, 66, 92, 118].map((x) => <rect key={x} x={x} y="65" width="20" height="4" rx="2" fill="#475569" />)}
          {cards(84, 2)}
          <rect x="160" y="84" width="66" height="56" rx={r} fill={light} opacity=".9" />
          <rect x="168" y="92" width="50" height="5" rx="2.5" fill={accent} />
          {[102, 112, 122].map((y) => <rect key={y} x="168" y={y} width="50" height="4" rx="2" fill="#cbd5e1" />)}
        </g>
      );
      break;
    case 'corporate-bars':
      body = (
        <g>
          <rect x="0" y="18" width="240" height="7" fill="#071230" />
          <rect x="0" y="25" width="240" height="24" fill={light} opacity=".95" />
          <circle cx="20" cy="37" r="9" fill={primary} />
          <rect x="36" y="32" width="70" height="5" rx="2.5" fill="#0f172a" />
          <rect x="36" y="40" width="50" height="4" rx="2" fill="#64748b" />
          <rect x="0" y="49" width="240" height="12" fill={primary} />
          <rect x="4" y="51" width="20" height="8" fill={accent} />
          {cards(74, 3)}
          {cards(112, 3)}
        </g>
      );
      break;
    case 'newspaper':
      body = (
        <g>
          <rect x="0" y="18" width="240" height="20" fill={light} opacity=".95" />
          <rect x="60" y="23" width="120" height="10" rx="2" fill={primary} />
          <rect x="0" y="40" width="240" height="6" fill={accent} opacity=".85" />
          {[14, 84, 154].map((x) => (
            <g key={x}>
              <rect x={x} y="52" width="64" height="4" rx="2" fill="#0f172a" />
              {[60, 68, 76, 84, 92].map((y) => <rect key={y} x={x} y={y} width="64" height="3" rx="1.5" fill="#94a3b8" />)}
            </g>
          ))}
          {cards(108, 3)}
        </g>
      );
      break;
    case 'split':
    case 'courses':
      body = (
        <g>
          {line(14, 36, 70)}{line(14, 46, 90, light, 0.7)}{line(14, 54, 60, light, 0.7)}
          <rect x="14" y="66" width="36" height="11" rx={r} fill={accent} />
          <rect x="130" y="30" width="96" height="58" rx={r * 1.5} fill={light} opacity=".9" />
          <circle cx="200" cy="48" r="10" fill={accent} />
          {cards(100, template.preview.layout === 'courses' ? 3 : 3)}
        </g>
      );
      break;
    case 'playful':
      body = (
        <g>
          <circle cx="40" cy="60" r="26" fill={accent} opacity=".9" />
          <circle cx="205" cy="45" r="18" fill={light} opacity=".85" />
          <circle cx="180" cy="80" r="10" fill={primary} opacity=".9" />
          {line(80, 46, 80)}{line(80, 56, 60, light, 0.7)}
          <rect x="80" y="68" width="38" height="12" rx="6" fill={light} />
          {cards(100, 4)}
        </g>
      );
      break;
    case 'classic':
    case 'arch':
      body = (
        <g>
          {template.preview.layout === 'arch' && <path d="M90 90 V55 a30 30 0 0 1 60 0 V90 Z" fill="none" stroke={accent} strokeWidth="3" />}
          <rect x="70" y="36" width="100" height="5" rx="2.5" fill={accent} opacity={template.preview.layout === 'arch' ? 0 : 1} />
          {line(80, 58, 80)}{line(95, 68, 50, light, 0.7)}
          <rect x="102" y="78" width="36" height="10" rx={r} fill={accent} />
          {cards(100, 3)}
        </g>
      );
      break;
    case 'bold':
      body = (
        <g>
          <rect x="14" y="32" width="110" height="10" rx="2" fill={light} />
          <rect x="14" y="46" width="80" height="10" rx="2" fill={accent} />
          {line(14, 62, 90, light, 0.7)}
          <rect x="150" y="30" width="76" height="60" rx={r} fill={accent} opacity=".9" />
          {cards(100, 3)}
        </g>
      );
      break;
    case 'grid':
      body = (
        <g>
          {line(14, 36, 90)}{line(14, 46, 60, light, 0.7)}
          <rect x="14" y="58" width="36" height="10" rx={r} fill={accent} />
          {cards(80, 4)}
          {cards(120, 4)}
        </g>
      );
      break;
    case 'minimal':
      body = (
        <g>
          <rect x="70" y="40" width="100" height="7" rx="3.5" fill={primary} />
          <rect x="85" y="54" width="70" height="4" rx="2" fill="#64748b" />
          <rect x="112" y="68" width="16" height="3" rx="1.5" fill={accent} />
          {[88, 100, 112, 124].map((y) => <rect key={y} x="60" y={y} width="120" height="4" rx="2" fill="#cbd5e1" />)}
        </g>
      );
      break;
    default: // hero-center, cards
      body = (
        <g>
          {line(70, 38, 100)}{line(85, 48, 70, light, 0.7)}
          <rect x="84" y="62" width="34" height="11" rx={r} fill={accent} />
          <rect x="122" y="62" width="34" height="11" rx={r} fill="none" stroke={light} />
          {cards(96, template.preview.layout === 'cards' ? 3 : 3)}
        </g>
      );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: template.preview.background, aspectRatio: '16 / 10' }}>
      <svg viewBox="0 0 240 150" className="block h-full w-full" role="img" aria-label={`${template.name} preview`}>
        {nav}
        {body}
        <text x="232" y="144" textAnchor="end" fontSize="7" fill={template.preview.layout === 'minimal' ? '#475569' : onPrimary} opacity=".7">{template.nameBn}</text>
      </svg>
    </div>
  );
}
