const GRADIENTS: [string, string][] = [
    ['#3b82f6', '#6366f1'], // blue → indigo
    ['#10b981', '#0d9488'], // emerald → teal
    ['#f59e0b', '#f97316'], // amber → orange
    ['#f43f5e', '#ec4899'], // rose → pink
    ['#8b5cf6', '#a855f7'], // violet → purple
    ['#06b6d4', '#0ea5e9'], // cyan → sky
];

export function avatarGradient(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
    }
    const [from, to] = GRADIENTS[hash % GRADIENTS.length];
    return `linear-gradient(135deg, ${from}, ${to})`;
}
