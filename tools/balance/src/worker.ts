/** Child process of `runJobs`: plays one job and sends its results to the parent. */
import { runJob, type Job } from './runner';

const job = JSON.parse(process.argv[2]!) as Job;
process.send!(runJob(job), () => process.exit(0));
