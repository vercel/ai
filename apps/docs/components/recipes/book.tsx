import type { CSSProperties } from 'react';
import styles from './book.module.css';

/**
 * 3D book cover used on the /resources/recipes guides grid (ported from the
 * legacy ai-sdk.dev Book component, simple variant).
 */
export const Book = ({
  title,
  color,
  textColor,
  width = 196,
}: {
  title: string;
  color: string;
  textColor: string;
  width?: number;
}) => (
  <div
    className={styles.perspective}
    style={
      {
        '--book-width': width,
        '--book-color': color,
        '--book-text-color': textColor,
      } as CSSProperties
    }
  >
    <div className={styles.rotateWrapper}>
      <div className={styles.book}>
        <div className={styles.body}>
          <div aria-hidden className={styles.bind} />
          <div className={styles.content}>
            <span className={styles.title}>{title}</span>
          </div>
        </div>
      </div>
      <div aria-hidden className={styles.pages} />
      <div aria-hidden className={styles.back} />
    </div>
  </div>
);
