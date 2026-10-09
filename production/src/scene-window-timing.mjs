/** A shared clock for an entire entrance, including motion, labels and holds.
 * Keep historical absolute arithmetic on roomy windows. Short windows use a
 * local clock, so tiny positive durations cannot round phase boundaries away.
 */
export function windowClock(t,segment,budget) {
 const width=segment.end-segment.start;
 if(width>=budget)return {time:t,start:segment.start,end:segment.end};
 const time=t<=segment.start?0:t>=segment.end?budget:(t-segment.start)/width*budget;
 return {time,start:0,end:budget};
}
