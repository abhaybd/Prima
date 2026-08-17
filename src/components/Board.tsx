import { Chessboard } from 'react-chessboard'
import styles from './Board.module.css'

interface Props {
  fen: string
  orientation: 'white' | 'black'
  interactive: boolean
  onMove: (from: string, to: string, promotion?: string) => boolean
}

export function Board({ fen, orientation, interactive, onMove }: Props) {
  return (
    <div className={styles.wrap}>
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        arePiecesDraggable={interactive}
        onPieceDrop={(source, target) => {
          if (!interactive) return false
          return onMove(source, target)
        }}
        onPromotionPieceSelect={(piece, from, to) => {
          if (!interactive || !piece || !from || !to) return false
          return onMove(from, to, piece[1]?.toLowerCase())
        }}
        animationDuration={150}
        customBoardStyle={{ borderRadius: 4 }}
        customDarkSquareStyle={{ backgroundColor: '#3d5a4c' }}
        customLightSquareStyle={{ backgroundColor: '#e8eddf' }}
      />
    </div>
  )
}
