/**
 * Expedition probe on its own (also a section of the balance report since chantier 18).
 *   pnpm balance:expeditions [--seeds 300]
 */
import { expeditionProbe } from './probe';

const seeds = Number(process.argv[process.argv.indexOf('--seeds') + 1]) || 300;
console.log(expeditionProbe(seeds).join('\n'));
