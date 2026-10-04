import {
  Activity, BookOpen, Bus, Calendar, Globe, GraduationCap, Heart, Landmark, Lightbulb, MapPin, Monitor,
  Palette, Phone, ShieldCheck, Star, Trophy, Users, Wrench, FlaskConical, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  book: BookOpen, graduation: GraduationCap, users: Users, trophy: Trophy, flask: FlaskConical, computer: Monitor,
  palette: Palette, ball: Activity, bus: Bus, shield: ShieldCheck, heart: Heart, globe: Globe, mosque: Landmark,
  calendar: Calendar, star: Star, wrench: Wrench, lightbulb: Lightbulb, phone: Phone, map: MapPin,
};

export function BlockIcon({ name, size = 24, className }: { name?: string; size?: number; className?: string }) {
  const Icon = name ? ICONS[name] : undefined;
  if (!Icon) return null;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
