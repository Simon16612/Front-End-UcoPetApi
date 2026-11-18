import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { Headquarter } from '../../models/headquarter/headquarter.model';

export function acrossHeadquarters<T>(
  headquarters$: Observable<Headquarter[]>,
  load: (headquarterId: string) => Observable<T[]>,
): Observable<T[]> {
  return headquarters$.pipe(
    map((headquarters) => headquarters.filter((headquarter) => headquarter.isActive)),
    switchMap((active) =>
      active.length === 0
        ? of([] as T[][])
        : forkJoin(active.map((headquarter) => load(headquarter.id).pipe(catchError(() => of([] as T[]))))),
    ),
    map((groups) => groups.flat()),
  );
}
