/** Layout blocks: Section, Columns (drop zones via Puck slots), Spacer, Divider. */
import { BlockSection, optimiseImage, sectionDefaults, sectionFields, selectField, textField, type SectionProps, type SiteBlock, type SlotRender } from './shared';

export const Section: SiteBlock = {
  label: 'Section',
  fields: {
    ...sectionFields,
    backgroundImage: textField('Background image URL'),
    overlay: selectField('Image overlay', [['none', 'None'], ['light', 'Light'], ['dark', 'Dark'], ['brand', 'Brand colour']]),
    content: { type: 'slot' },
  },
  defaultProps: { ...sectionDefaults, backgroundImage: '', overlay: 'dark', content: [] },
  render: (p) => {
    const Content = p.content as SlotRender;
    const img = optimiseImage(p.backgroundImage as string, 1920);
    const overlay: Record<string, string> = {
      light: 'rgb(255 255 255 / .75)', dark: 'rgb(15 23 42 / .62)', brand: 'color-mix(in srgb, var(--site-primary) 78%, transparent)',
    };
    const hasImg = Boolean(img);
    return (
      <div className={hasImg ? 'site-hero' : undefined} style={hasImg && p.overlay !== 'light' ? { color: '#fff' } : undefined}>
        {hasImg && <img src={img} alt="" loading="lazy" decoding="async" className="site-hero-media" />}
        {hasImg && p.overlay !== 'none' && <div className="site-hero-overlay" style={{ background: overlay[p.overlay as string] }} />}
        <BlockSection {...(p as SectionProps)} tone={hasImg ? undefined : (p.tone as SectionProps['tone'])} className={hasImg ? '!bg-transparent' : ''}>
          <Content className="flex flex-col gap-6" minEmptyHeight={120} />
        </BlockSection>
      </div>
    );
  },
};

const GRID: Record<string, string> = {
  '2': 'md:grid-cols-2',
  '2-1-2': 'md:grid-cols-[1fr_2fr]',
  '2-2-1': 'md:grid-cols-[2fr_1fr]',
  '3': 'sm:grid-cols-2 lg:grid-cols-3',
  '4': 'sm:grid-cols-2 lg:grid-cols-4',
};
const GAP: Record<string, string> = { sm: 'gap-4', md: 'gap-6 md:gap-8', lg: 'gap-8 md:gap-12' };
const ALIGN: Record<string, string> = { start: 'items-start', center: 'items-center', stretch: 'items-stretch' };

export const Columns: SiteBlock = {
  label: 'Columns',
  fields: {
    layout: selectField('Columns', [['2', '2 equal'], ['2-1-2', '2 (narrow + wide)'], ['2-2-1', '2 (wide + narrow)'], ['3', '3 equal'], ['4', '4 equal']]),
    gap: selectField('Gap', [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]),
    align: selectField('Vertical alignment', [['start', 'Top'], ['center', 'Middle'], ['stretch', 'Stretch']]),
    col1: { type: 'slot', label: 'Column 1' },
    col2: { type: 'slot', label: 'Column 2' },
    col3: { type: 'slot', label: 'Column 3' },
    col4: { type: 'slot', label: 'Column 4' },
  },
  defaultProps: { layout: '2', gap: 'md', align: 'start', col1: [], col2: [], col3: [], col4: [] },
  resolveFields: (data, { fields }) => {
    const n = String(data.props.layout ?? '2').charAt(0);
    const count = Number(n) || 2;
    const out = { ...fields };
    if (count < 3) delete (out as Record<string, unknown>).col3;
    if (count < 4) delete (out as Record<string, unknown>).col4;
    return out;
  },
  render: (p) => {
    const layout = String(p.layout ?? '2');
    const count = Number(layout.charAt(0)) || 2;
    const cols = [p.col1, p.col2, p.col3, p.col4].slice(0, count) as SlotRender[];
    return (
      <div className={`grid grid-cols-1 ${GRID[layout] ?? GRID['2']} ${GAP[p.gap as string] ?? GAP.md} ${ALIGN[p.align as string] ?? ''}`}>
        {cols.map((Col, i) => (typeof Col === 'function' ? <Col key={i} className="flex min-w-0 flex-col gap-4" minEmptyHeight={80} /> : <div key={i} />))}
      </div>
    );
  },
};

const SPACE: Record<string, string> = { xs: 'h-4', sm: 'h-8', md: 'h-12 md:h-16', lg: 'h-16 md:h-24', xl: 'h-24 md:h-36' };

export const Spacer: SiteBlock = {
  label: 'Spacer',
  fields: { size: selectField('Height', [['xs', 'Extra small'], ['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large'], ['xl', 'Extra large']]) },
  defaultProps: { size: 'md' },
  render: (p) => <div aria-hidden className={SPACE[p.size as string] ?? SPACE.md} />,
};

export const Divider: SiteBlock = {
  label: 'Divider',
  fields: {
    lineStyle: selectField('Line', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['brand', 'Short brand bar']]),
    width: selectField('Width', [['narrow', 'Narrow'], ['default', 'Standard'], ['wide', 'Wide'], ['full', 'Full']]),
    pad: selectField('Spacing', [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]),
  },
  defaultProps: { lineStyle: 'solid', width: 'default', pad: 'sm' },
  render: (p) => (
    <div className={`site-pad-${p.pad ?? 'sm'}`}>
      <div className={`site-container site-w-${p.width ?? 'default'}`}>
        {p.lineStyle === 'brand' ? (
          <div aria-hidden className="mx-auto h-1 w-16 rounded-full" style={{ background: 'var(--site-primary)' }} />
        ) : (
          <hr className="site-divider" style={{ borderTopStyle: (p.lineStyle as 'solid' | 'dashed' | 'dotted') ?? 'solid' }} />
        )}
      </div>
    </div>
  ),
};
