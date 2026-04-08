import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

@Injectable()
export class NotificationGatewayService {
  private streams = new Map<string, Subject<MessageEvent>>();

  getOrCreateStream(userId: string): Observable<MessageEvent> {
    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Subject<MessageEvent>());
    }
    return this.streams.get(userId)!.asObservable();
  }

  push(userId: string, data: unknown): void {
    const subject = this.streams.get(userId);
    if (subject) {
      subject.next({ data } as MessageEvent);
    }
  }

  removeStream(userId: string): void {
    const subject = this.streams.get(userId);
    if (subject) {
      subject.complete();
      this.streams.delete(userId);
    }
  }
}
