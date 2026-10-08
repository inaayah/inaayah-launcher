import rawCatalog from '../../games-catalog.json';
import type { GameCatalogItem } from '../types/launcher';

export const INAAYAH_GAMES_CATALOG: GameCatalogItem[] = rawCatalog as unknown as GameCatalogItem[];
export const catalogData: GameCatalogItem[] = INAAYAH_GAMES_CATALOG;
