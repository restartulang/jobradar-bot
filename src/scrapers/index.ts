import {feeds} from './feeds.ts'
import {localSources} from './indoLocal.ts'
export {Scanner} from './scanner.ts'
export const sources=[...feeds,...localSources]
