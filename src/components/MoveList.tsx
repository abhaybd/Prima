import styles from './MoveList.module.css'

interface Props {
  sans: string[]
}

export function MoveList({ sans }: Props) {
  const rows: { n: number; w?: string; b?: string }[] = []
  for (let i = 0; i < sans.length; i += 2) {
    rows.push({ n: i / 2 + 1, w: sans[i], b: sans[i + 1] })
  }
  return (
    <ol className={styles.list}>
      {rows.map((row) => (
        <li key={row.n}>
          <span className={styles.n}>{row.n}.</span>
          <span>{row.w}</span>
          {row.b ? <span>{row.b}</span> : null}
        </li>
      ))}
    </ol>
  )
}
