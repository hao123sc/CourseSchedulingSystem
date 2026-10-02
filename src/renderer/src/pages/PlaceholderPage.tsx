interface PlaceholderPageProps {
  title: string
  milestone: string
}

export function PlaceholderPage({ title, milestone }: PlaceholderPageProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-[color:var(--text-secondary)]">
        本页面将在 <span className="font-medium text-brand-600">{milestone}</span> 里程碑实现
      </p>
    </div>
  )
}
