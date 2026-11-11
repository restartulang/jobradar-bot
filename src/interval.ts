export class IntervalClock {
  minutes = 0
  next = 0
  tick(value: string | undefined, now: number) {
    const input = Number(value)
    const minutes = Number.isInteger(input) && input >= 1 && input <= 10080 ? input : 0
    if (minutes !== this.minutes) {
      this.minutes = minutes
      this.next = minutes ? now + minutes * 60000 : 0
    }
    if (!minutes || now < this.next) return false
    this.next += (Math.floor((now - this.next) / (minutes * 60000)) + 1) * minutes * 60000
    return true
  }
}
