import { waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

import {
  queryKey,
  sleep,
  mockConsoleError,
  renderWithClient,
  setActTimeout,
} from './utils'
import {
  useInfiniteQuery,
  UseInfiniteQueryResult,
  QueryClient,
  QueryCache,
} from '../..'

interface Result {
  items: number[]
  nextId?: number
  prevId?: number
  ts: number
}

const pageSize = 10

const initialItems = (page: number): Result => {
  return {
    items: [...new Array(10)].fill(null).map((_, d) => page * pageSize + d),
    nextId: page + 1,
    prevId: page - 1,
    ts: page,
  }
}

const fetchItems = async (
  page: number,
  ts: number,
  noNext?: boolean,
  noPrev?: boolean
): Promise<Result> => {
  await sleep(10)
  return {
    items: [...new Array(10)].fill(null).map((_, d) => page * pageSize + d),
    nextId: noNext ? undefined : page + 1,
    prevId: noPrev ? undefined : page - 1,
    ts,
  }
}

describe('useInfiniteQuery', () => {
  const cache = new QueryCache()
  const client = new QueryClient({ cache })

  it('should return the correct states for a successful query', async () => {
    const key = queryKey()

    let count = 0
    const states: UseInfiniteQueryResult<Result>[] = []

    function Page() {
      const state = useInfiniteQuery(
        key,
        (_key: string, nextId: number = 0) => fetchItems(nextId, count++),
        {
          getNextPageParam: (lastGroup, _allGroups) => lastGroup.nextId,
        }
      )

      states.push(state)

      return (
        <div>
          <h1>Status: {state.status}</h1>
        </div>
      )
    }

    const rendered = renderWithClient(client, <Page />)

    await waitFor(() => rendered.getByText('Status: success'))

    expect(states[0]).toEqual({
      data: undefined,
      error: null,
      failureCount: 0,
      fetchNextPage: expect.any(Function),
      fetchPreviousPage: expect.any(Function),
      hasNextPage: undefined,
      hasPreviousPage: undefined,
      isError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isFetching: true,
      isFetchingNextPage: false,
      isFetchingPreviousPage: false,
      isIdle: false,
      isLoading: true,
      isPreviousData: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'loading',
      updatedAt: expect.any(Number),
    })

    expect(states[1]).toEqual({
      data: [
        {
          items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
          nextId: 1,
          prevId: -1,
          ts: 0,
        },
      ],
      error: null,
      failureCount: 0,
      fetchNextPage: expect.any(Function),
      fetchPreviousPage: expect.any(Function),
      hasNextPage: true,
      hasPreviousPage: undefined,
      isError: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchingPreviousPage: false,
      isIdle: false,
      isLoading: false,
      isPreviousData: false,
      isStale: true,
      isSuccess: true,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'success',
      updatedAt: expect.any(Number),
    })
  })

  it('should not throw when fetchNextPage returns an error', async () => {
    const consoleMock = mockConsoleError()
    const key = queryKey()
    let noThrow: boolean

    function Page() {
      const start = 1
      const state = useInfiniteQuery(
        key,
        async (_key, page: number = start) => {
          if (page === 2) {
            throw new Error('error')
          }
          return page
        },
        {
          retry: 1,
          retryDelay: 10,
          getNextPageParam: (lastPage, _pages) => lastPage + 1,
        }
      )

      const { fetchNextPage } = state

      React.useEffect(() => {
        setActTimeout(() => {
          fetchNextPage()
            .then(() => {
              noThrow = true
            })
            .catch(() => undefined)
        }, 20)
      }, [fetchNextPage])

      return null
    }

    renderWithClient(client, <Page />)

    await waitFor(() => expect(noThrow).toBe(true))
    consoleMock.mockRestore()
  })

  it('should keep the previous data when keepPreviousData is set', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<string>[] = []

    function Page() {
      const [order, setOrder] = React.useState('desc')

      const state = useInfiniteQuery(
        [key, order],
        async (_key, orderArg, pageArg = 0) => {
          await sleep(10)
          return `${pageArg}-${orderArg}`
        },
        {
          getNextPageParam: (_lastGroup, _allGroups) => 1,
          keepPreviousData: true,
        }
      )

      states.push(state)

      const { fetchNextPage } = state

      React.useEffect(() => {
        setActTimeout(() => {
          fetchNextPage()
        }, 50)
        setActTimeout(() => {
          setOrder('asc')
        }, 100)
      }, [fetchNextPage])

      return null
    }

    renderWithClient(client, <Page />)

    await sleep(300)

    expect(states.length).toBe(7)
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: false,
      isPreviousData: false,
    })
    expect(states[1]).toMatchObject({
      data: ['0-desc'],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
      isPreviousData: false,
    })
    expect(states[2]).toMatchObject({
      data: ['0-desc'],
      isFetching: true,
      isFetchingNextPage: true,
      isSuccess: true,
      isPreviousData: false,
    })
    expect(states[3]).toMatchObject({
      data: ['0-desc', '1-desc'],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
      isPreviousData: false,
    })
    // Set state
    expect(states[4]).toMatchObject({
      data: ['0-desc', '1-desc'],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
      isPreviousData: false,
    })
    expect(states[5]).toMatchObject({
      data: ['0-desc', '1-desc'],
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: true,
      isPreviousData: true,
    })
    expect(states[6]).toMatchObject({
      data: ['0-asc'],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
      isPreviousData: false,
    })
  })

  it('should be able to select a part of the data', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<string>[] = []

    function Page() {
      const state = useInfiniteQuery(key, () => ({ count: 1 }), {
        select: data => data.map(x => `count: ${x.count}`),
      })
      states.push(state)
      return null
    }

    renderWithClient(client, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({
      data: undefined,
      isSuccess: false,
    })
    expect(states[1]).toMatchObject({
      data: ['count: 1'],
      isSuccess: true,
    })
  })

  it('should be able to fetch a previous page', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<number>[] = []

    function Page() {
      const start = 10
      const state = useInfiniteQuery(
        key,
        async (_key, page: number = start) => {
          await sleep(10)
          return page
        },
        {
          getPreviousPageParam: (lastPage, _pages) => lastPage - 1,
        }
      )

      states.push(state)

      const { fetchPreviousPage } = state

      React.useEffect(() => {
        setActTimeout(() => {
          fetchPreviousPage()
        }, 20)
      }, [fetchPreviousPage])

      return null
    }

    renderWithClient(client, <Page />)

    await sleep(100)

    expect(states.length).toBe(4)
    expect(states[0]).toMatchObject({
      data: undefined,
      hasNextPage: undefined,
      hasPreviousPage: undefined,
      isFetching: true,
      isFetchingNextPage: false,
      isFetchingPreviousPage: false,
      isSuccess: false,
    })
    expect(states[1]).toMatchObject({
      data: [10],
      hasNextPage: undefined,
      hasPreviousPage: true,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchingPreviousPage: false,
      isSuccess: true,
    })
    expect(states[2]).toMatchObject({
      data: [10],
      hasNextPage: undefined,
      hasPreviousPage: true,
      isFetching: true,
      isFetchingNextPage: false,
      isFetchingPreviousPage: true,
      isSuccess: true,
    })
    expect(states[3]).toMatchObject({
      data: [9, 10],
      hasNextPage: undefined,
      hasPreviousPage: true,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchingPreviousPage: false,
      isSuccess: true,
    })
  })

  it('should prepend pages when the append mode is set to prepend', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<number>[] = []

    function Page() {
      const start = 10
      const state = useInfiniteQuery(
        key,
        async (_key, page: number = start) => {
          await sleep(10)
          return page
        },
        {
          pageAppendMode: 'prepend',
          getNextPageParam: (lastPage, _pages) => lastPage + 1,
        }
      )

      states.push(state)

      const { fetchNextPage } = state

      React.useEffect(() => {
        setActTimeout(() => {
          fetchNextPage()
        }, 20)
      }, [fetchNextPage])

      return null
    }

    renderWithClient(client, <Page />)

    await waitFor(() => expect(states.length).toBe(4))

    expect(states[0]).toMatchObject({
      hasNextPage: undefined,
      data: undefined,
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: false,
    })
    expect(states[1]).toMatchObject({
      hasNextPage: true,
      data: [10],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
    expect(states[2]).toMatchObject({
      hasNextPage: true,
      data: [10],
      isFetching: true,
      isFetchingNextPage: true,
      isSuccess: true,
    })
    expect(states[3]).toMatchObject({
      hasNextPage: true,
      data: [11, 10],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
  })

  it('should append pages when the append mode is prepend and a previous page is fetched', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<number>[] = []

    function Page() {
      const start = 10
      const state = useInfiniteQuery(
        key,
        async (_key, page: number = start) => {
          await sleep(10)
          return page
        },
        {
          pageAppendMode: 'prepend',
          getPreviousPageParam: (lastPage, _pages) => lastPage - 1,
        }
      )

      states.push(state)

      const { fetchPreviousPage } = state

      React.useEffect(() => {
        setActTimeout(() => {
          fetchPreviousPage()
        }, 20)
      }, [fetchPreviousPage])

      return null
    }

    renderWithClient(client, <Page />)

    await waitFor(() => expect(states.length).toBe(4))

    expect(states[0]).toMatchObject({
      hasPreviousPage: undefined,
      data: undefined,
      isFetching: true,
      isFetchingPreviousPage: false,
      isSuccess: false,
    })
    expect(states[1]).toMatchObject({
      hasPreviousPage: true,
      data: [10],
      isFetching: false,
      isFetchingPreviousPage: false,
      isSuccess: true,
    })
    expect(states[2]).toMatchObject({
      hasPreviousPage: true,
      data: [10],
      isFetching: true,
      isFetchingPreviousPage: true,
      isSuccess: true,
    })
    expect(states[3]).toMatchObject({
      hasPreviousPage: true,
      data: [10, 9],
      isFetching: false,
      isFetchingPreviousPage: false,
      isSuccess: true,
    })
  })

  it('should silently cancel any ongoing fetch when fetching more', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<number>[] = []

    function Page() {
      const start = 10
      const state = useInfiniteQuery(
        key,
        async (_key, page: number = start) => {
          await sleep(50)
          return page
        },
        {
          getNextPageParam: (lastPage, _pages) => lastPage + 1,
        }
      )

      states.push(state)

      const { refetch, fetchNextPage } = state

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 100)
        setActTimeout(() => {
          fetchNextPage()
        }, 110)
      }, [fetchNextPage, refetch])

      return null
    }

    renderWithClient(client, <Page />)

    await sleep(300)

    expect(states.length).toBe(5)
    expect(states[0]).toMatchObject({
      hasNextPage: undefined,
      data: undefined,
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: false,
    })
    expect(states[1]).toMatchObject({
      hasNextPage: true,
      data: [10],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
    expect(states[2]).toMatchObject({
      hasNextPage: true,
      data: [10],
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: true,
    })
    expect(states[3]).toMatchObject({
      hasNextPage: true,
      data: [10],
      isFetching: true,
      isFetchingNextPage: true,
      isSuccess: true,
    })
    expect(states[4]).toMatchObject({
      hasNextPage: true,
      data: [10, 11],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
  })

  it('should keep fetching first page when not loaded yet and triggering fetch more', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<number>[] = []

    function Page() {
      const start = 10
      const state = useInfiniteQuery(
        key,
        async (_key, page: number = start) => {
          await sleep(50)
          return page
        },
        {
          getNextPageParam: (lastPage, _pages) => lastPage + 1,
        }
      )

      states.push(state)

      const { refetch, fetchNextPage } = state

      React.useEffect(() => {
        setActTimeout(() => {
          fetchNextPage()
        }, 10)
      }, [fetchNextPage, refetch])

      return null
    }

    renderWithClient(client, <Page />)

    await sleep(100)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({
      hasNextPage: undefined,
      data: undefined,
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: false,
    })
    expect(states[1]).toMatchObject({
      hasNextPage: true,
      data: [10],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
  })

  it('should be able to override the cursor in the fetchNextPage callback', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<number>[] = []

    function Page() {
      const state = useInfiniteQuery(
        key,
        async (_key, page: number = 0) => {
          await sleep(10)
          return page
        },
        {
          getNextPageParam: (lastPage, _pages) => lastPage + 1,
        }
      )

      states.push(state)

      const { fetchNextPage } = state

      React.useEffect(() => {
        setActTimeout(() => {
          fetchNextPage(5)
        }, 20)
      }, [fetchNextPage])

      return null
    }

    renderWithClient(client, <Page />)

    await sleep(100)

    expect(states.length).toBe(4)
    expect(states[0]).toMatchObject({
      hasNextPage: undefined,
      data: undefined,
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: false,
    })
    expect(states[1]).toMatchObject({
      hasNextPage: true,
      data: [0],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
    expect(states[2]).toMatchObject({
      hasNextPage: true,
      data: [0],
      isFetching: true,
      isFetchingNextPage: true,
      isSuccess: true,
    })
    expect(states[3]).toMatchObject({
      hasNextPage: true,
      data: [0, 5],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
  })

  it('should be able to set new pages with the query client', async () => {
    const key = queryKey()
    const states: UseInfiniteQueryResult<number>[] = []

    function Page() {
      const [firstPage, setFirstPage] = React.useState(0)

      const state = useInfiniteQuery(
        key,
        async (_key, page: number = firstPage) => {
          await sleep(10)
          return page
        },
        {
          getNextPageParam: (lastPage, _pages) => lastPage + 1,
        }
      )

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          client.setQueryData(key, [7, 8])
          setFirstPage(7)
        }, 20)

        setActTimeout(() => {
          refetch()
        }, 50)
      }, [refetch])

      return null
    }

    renderWithClient(client, <Page />)

    await sleep(100)

    expect(states.length).toBe(6)
    expect(states[0]).toMatchObject({
      hasNextPage: undefined,
      data: undefined,
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: false,
    })
    // After first fetch
    expect(states[1]).toMatchObject({
      hasNextPage: true,
      data: [0],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
    // Set state
    expect(states[2]).toMatchObject({
      hasNextPage: true,
      data: [0],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
    // Cache update
    expect(states[3]).toMatchObject({
      hasNextPage: true,
      data: [7, 8],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
    // Refetch
    expect(states[4]).toMatchObject({
      hasNextPage: true,
      data: [7, 8],
      isFetching: true,
      isFetchingNextPage: false,
      isSuccess: true,
    })
    // Refetch done
    expect(states[5]).toMatchObject({
      hasNextPage: true,
      data: [7, 8],
      isFetching: false,
      isFetchingNextPage: false,
      isSuccess: true,
    })
  })

  it('should allow you to fetch more pages', async () => {
    const key = queryKey()

    function Page() {
      const fetchCountRef = React.useRef(0)
      const {
        status,
        data,
        error,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        refetch,
      } = useInfiniteQuery<Result, Error>(
        key,
        (_key, nextId = 0) => fetchItems(nextId, fetchCountRef.current++),
        {
          getNextPageParam: (lastGroup, _allGroups) => lastGroup.nextId,
        }
      )

      return (
        <div>
          <h1>Pagination</h1>
          {status === 'loading' ? (
            'Loading...'
          ) : status === 'error' ? (
            <span>Error: {error?.message}</span>
          ) : (
            <>
              <div>Data:</div>
              {data?.map((page, i) => (
                <div key={i}>
                  <div>
                    Page {i}: {page.ts}
                  </div>
                  <div key={i}>
                    {page.items.map(item => (
                      <p key={item}>Item: {item}</p>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || Boolean(isFetchingNextPage)}
                >
                  {isFetchingNextPage
                    ? 'Loading more...'
                    : hasNextPage
                    ? 'Load More'
                    : 'Nothing more to load'}
                </button>
                <button onClick={() => refetch()}>Refetch</button>
              </div>
              <div>
                {isFetching && !isFetchingNextPage
                  ? 'Background Updating...'
                  : null}
              </div>
            </>
          )}
        </div>
      )
    }

    const rendered = renderWithClient(client, <Page />)

    rendered.getByText('Loading...')

    await waitFor(() => {
      rendered.getByText('Item: 9')
      rendered.getByText('Page 0: 0')
    })

    fireEvent.click(rendered.getByText('Load More'))

    await waitFor(() => rendered.getByText('Loading more...'))

    await waitFor(() => {
      rendered.getByText('Item: 19')
      rendered.getByText('Page 0: 0')
      rendered.getByText('Page 1: 1')
    })

    fireEvent.click(rendered.getByText('Refetch'))

    await waitFor(() => rendered.getByText('Background Updating...'))
    await waitFor(() => {
      rendered.getByText('Item: 19')
      rendered.getByText('Page 0: 2')
      rendered.getByText('Page 1: 3')
    })
  })

  it('should compute hasNextPage correctly for falsy getFetchMore return value', async () => {
    const key = queryKey()

    function Page() {
      const fetchCountRef = React.useRef(0)
      const {
        status,
        data,
        error,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        refetch,
      } = useInfiniteQuery<Result, Error, [string, number]>(
        key,
        (_key, nextId = 0) => fetchItems(nextId, fetchCountRef.current++),
        {
          getNextPageParam: (_lastGroup, _allGroups) => undefined,
        }
      )

      return (
        <div>
          <h1>Pagination</h1>
          {status === 'loading' ? (
            'Loading...'
          ) : status === 'error' ? (
            <span>Error: {error?.message}</span>
          ) : (
            <>
              <div>Data:</div>
              {data?.map((page, i) => (
                <div key={i}>
                  <div>
                    Page {i}: {page.ts}
                  </div>
                  <div key={i}>
                    {page.items.map(item => (
                      <p key={item}>Item: {item}</p>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || Boolean(isFetchingNextPage)}
                >
                  {isFetchingNextPage
                    ? 'Loading more...'
                    : hasNextPage
                    ? 'Load More'
                    : 'Nothing more to load'}
                </button>
                <button onClick={() => refetch()}>Refetch</button>
              </div>
              <div>
                {isFetching && !isFetchingNextPage
                  ? 'Background Updating...'
                  : null}
              </div>
            </>
          )}
        </div>
      )
    }

    const rendered = renderWithClient(client, <Page />)

    rendered.getByText('Loading...')

    await waitFor(() => {
      rendered.getByText('Item: 9')
      rendered.getByText('Page 0: 0')
    })

    rendered.getByText('Nothing more to load')
  })

  it('should compute hasNextPage correctly using initialData', async () => {
    const key = queryKey()

    function Page() {
      const fetchCountRef = React.useRef(0)
      const {
        status,
        data,
        error,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        refetch,
      } = useInfiniteQuery<Result, Error>(
        key,
        (_key, nextId = 0) => fetchItems(nextId, fetchCountRef.current++),
        {
          staleTime: 1000,
          initialData: [initialItems(0)],
          getNextPageParam: (lastGroup, _allGroups) => lastGroup.nextId,
        }
      )

      return (
        <div>
          <h1>Pagination</h1>
          {status === 'loading' ? (
            'Loading...'
          ) : status === 'error' ? (
            <span>Error: {error?.message}</span>
          ) : (
            <>
              <div>Data:</div>
              {data?.map((page, i) => (
                <div key={i}>
                  <div>
                    Page {i}: {page.ts}
                  </div>
                  <div key={i}>
                    {page.items.map(item => (
                      <p key={item}>Item: {item}</p>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || Boolean(isFetchingNextPage)}
                >
                  {isFetchingNextPage
                    ? 'Loading more...'
                    : hasNextPage
                    ? 'Load More'
                    : 'Nothing more to load'}
                </button>
                <button onClick={() => refetch()}>Refetch</button>
              </div>
              <div>
                {isFetching && !isFetchingNextPage
                  ? 'Background Updating...'
                  : null}
              </div>
            </>
          )}
        </div>
      )
    }

    const rendered = renderWithClient(client, <Page />)

    rendered.getByText('Item: 9')
    rendered.getByText('Page 0: 0')

    fireEvent.click(rendered.getByText('Load More'))

    await waitFor(() => rendered.getByText('Loading more...'))

    await waitFor(() => {
      rendered.getByText('Item: 19')
      rendered.getByText('Page 1: 0')
    })

    fireEvent.click(rendered.getByText('Refetch'))

    await waitFor(() => rendered.getByText('Background Updating...'))
    await waitFor(() => {
      rendered.getByText('Item: 19')
      rendered.getByText('Page 0: 1')
      rendered.getByText('Page 1: 2')
    })
  })

  it('should compute hasNextPage correctly for falsy getFetchMore return value using initialData', async () => {
    const key = queryKey()

    function Page() {
      const fetchCountRef = React.useRef(0)
      const {
        status,
        data,
        error,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        refetch,
      } = useInfiniteQuery<Result, Error, [string, number]>(
        key,
        (_key, nextId = 0) => fetchItems(nextId, fetchCountRef.current++),
        {
          staleTime: 1000,
          initialData: [initialItems(0)],
          getNextPageParam: (_lastGroup, _allGroups) => undefined,
        }
      )

      return (
        <div>
          <h1>Pagination</h1>
          {status === 'loading' ? (
            'Loading...'
          ) : status === 'error' ? (
            <span>Error: {error?.message}</span>
          ) : (
            <>
              <div>Data:</div>
              {data?.map((page, i) => (
                <div key={i}>
                  <div>
                    Page {i}: {page.ts}
                  </div>
                  <div key={i}>
                    {page.items.map(item => (
                      <p key={item}>Item: {item}</p>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || Boolean(isFetchingNextPage)}
                >
                  {isFetchingNextPage
                    ? 'Loading more...'
                    : hasNextPage
                    ? 'Load More'
                    : 'Nothing more to load'}
                </button>
                <button onClick={() => refetch()}>Refetch</button>
              </div>
              <div>
                {isFetching && !isFetchingNextPage
                  ? 'Background Updating...'
                  : null}
              </div>
            </>
          )}
        </div>
      )
    }

    const rendered = renderWithClient(client, <Page />)

    rendered.getByText('Item: 9')
    rendered.getByText('Page 0: 0')

    rendered.getByText('Nothing more to load')
  })

  it('should build fresh cursors on refetch', async () => {
    const key = queryKey()

    const genItems = (size: number) =>
      [...new Array(size)].fill(null).map((_, d) => d)
    const items = genItems(15)
    const limit = 3

    const fetchItemsWithLimit = async (cursor = 0, ts: number) => {
      await sleep(10)
      return {
        nextId: cursor + limit,
        items: items.slice(cursor, cursor + limit),
        ts,
      }
    }

    function Page() {
      const fetchCountRef = React.useRef(0)
      const {
        status,
        data,
        error,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        refetch,
      } = useInfiniteQuery<Result, Error>(
        key,
        (_key, nextId = 0) =>
          fetchItemsWithLimit(nextId, fetchCountRef.current++),
        {
          getNextPageParam: (lastGroup, _allGroups) => lastGroup.nextId,
        }
      )

      return (
        <div>
          <h1>Pagination</h1>
          {status === 'loading' ? (
            'Loading...'
          ) : status === 'error' ? (
            <span>Error: {error?.message}</span>
          ) : (
            <>
              <div>Data:</div>
              {data?.map((page, i) => (
                <div key={i}>
                  <div>
                    Page {i}: {page.ts}
                  </div>
                  <div key={i}>
                    {page.items.map(item => (
                      <p key={item}>Item: {item}</p>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || Boolean(isFetchingNextPage)}
                >
                  {isFetchingNextPage
                    ? 'Loading more...'
                    : hasNextPage
                    ? 'Load More'
                    : 'Nothing more to load'}
                </button>
                <button onClick={() => refetch()}>Refetch</button>
                <button
                  onClick={() => {
                    // Imagine that this mutation happens somewhere else
                    // makes an actual network request
                    // and calls invalidateQueries in an onSuccess
                    items.splice(4, 1)
                    client.invalidateQueries(key)
                  }}
                >
                  Remove item
                </button>
              </div>
              <div>{!isFetchingNextPage ? 'Background Updating...' : null}</div>
            </>
          )}
        </div>
      )
    }

    const rendered = renderWithClient(client, <Page />)

    rendered.getByText('Loading...')

    await waitFor(() => rendered.getByText('Item: 2'))
    await waitFor(() => rendered.getByText('Page 0: 0'))

    fireEvent.click(rendered.getByText('Load More'))

    await waitFor(() => rendered.getByText('Loading more...'))
    await waitFor(() => rendered.getByText('Item: 5'))
    await waitFor(() => rendered.getByText('Page 0: 0'))
    await waitFor(() => rendered.getByText('Page 1: 1'))

    fireEvent.click(rendered.getByText('Load More'))

    await waitFor(() => rendered.getByText('Loading more...'))
    await waitFor(() => rendered.getByText('Item: 8'))
    await waitFor(() => rendered.getByText('Page 0: 0'))
    await waitFor(() => rendered.getByText('Page 1: 1'))
    await waitFor(() => rendered.getByText('Page 2: 2'))

    fireEvent.click(rendered.getByText('Refetch'))

    await waitFor(() => rendered.getByText('Background Updating...'))
    await waitFor(() => rendered.getByText('Item: 8'))
    await waitFor(() => rendered.getByText('Page 0: 3'))
    await waitFor(() => rendered.getByText('Page 1: 4'))
    await waitFor(() => rendered.getByText('Page 2: 5'))

    // ensure that Item: 4 is rendered before removing it
    expect(rendered.queryAllByText('Item: 4')).toHaveLength(1)

    // remove Item: 4
    fireEvent.click(rendered.getByText('Remove item'))

    await waitFor(() => rendered.getByText('Background Updating...'))
    // ensure that an additional item is rendered (it means that cursors were properly rebuilt)
    await waitFor(() => rendered.getByText('Item: 9'))
    await waitFor(() => rendered.getByText('Page 0: 6'))
    await waitFor(() => rendered.getByText('Page 1: 7'))
    await waitFor(() => rendered.getByText('Page 2: 8'))

    // ensure that Item: 4 is no longer rendered
    expect(rendered.queryAllByText('Item: 4')).toHaveLength(0)
  })

  it('should compute hasNextPage correctly for falsy getFetchMore return value on refetching', async () => {
    const key = queryKey()
    const MAX = 2

    function Page() {
      const fetchCountRef = React.useRef(0)
      const [isRemovedLastPage, setIsRemovedLastPage] = React.useState<boolean>(
        false
      )
      const {
        status,
        data,
        error,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        refetch,
      } = useInfiniteQuery<Result, Error>(
        key,
        (_key, nextId = 0) =>
          fetchItems(
            nextId,
            fetchCountRef.current++,
            nextId === MAX || (nextId === MAX - 1 && isRemovedLastPage)
          ),
        {
          getNextPageParam: (lastGroup, _allGroups) => lastGroup.nextId,
        }
      )

      return (
        <div>
          <h1>Pagination</h1>
          {status === 'loading' ? (
            'Loading...'
          ) : status === 'error' ? (
            <span>Error: {error?.message}</span>
          ) : (
            <>
              <div>Data:</div>
              {data?.map((page, i) => (
                <div key={i}>
                  <div>
                    Page {i}: {page.ts}
                  </div>
                  <div key={i}>
                    {page.items.map(item => (
                      <p key={item}>Item: {item}</p>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={!hasNextPage || Boolean(isFetchingNextPage)}
                >
                  {isFetchingNextPage
                    ? 'Loading more...'
                    : hasNextPage
                    ? 'Load More'
                    : 'Nothing more to load'}
                </button>
                <button onClick={() => refetch()}>Refetch</button>
                <button onClick={() => setIsRemovedLastPage(true)}>
                  Remove Last Page
                </button>
              </div>
              <div>
                {isFetching && !isFetchingNextPage
                  ? 'Background Updating...'
                  : null}
              </div>
            </>
          )}
        </div>
      )
    }

    const rendered = renderWithClient(client, <Page />)

    rendered.getByText('Loading...')

    await waitFor(() => {
      rendered.getByText('Item: 9')
      rendered.getByText('Page 0: 0')
    })

    fireEvent.click(rendered.getByText('Load More'))

    await waitFor(() => rendered.getByText('Loading more...'))

    await waitFor(() => {
      rendered.getByText('Item: 19')
      rendered.getByText('Page 0: 0')
      rendered.getByText('Page 1: 1')
    })

    fireEvent.click(rendered.getByText('Load More'))

    await waitFor(() => rendered.getByText('Loading more...'))

    await waitFor(() => {
      rendered.getByText('Item: 29')
      rendered.getByText('Page 0: 0')
      rendered.getByText('Page 1: 1')
      rendered.getByText('Page 2: 2')
    })

    rendered.getByText('Nothing more to load')

    fireEvent.click(rendered.getByText('Remove Last Page'))

    await sleep(10)

    fireEvent.click(rendered.getByText('Refetch'))

    await waitFor(() => rendered.getByText('Background Updating...'))

    await waitFor(() => {
      rendered.getByText('Page 0: 3')
      rendered.getByText('Page 1: 4')
    })

    expect(rendered.queryByText('Item: 29')).toBeNull()
    expect(rendered.queryByText('Page 2: 5')).toBeNull()

    rendered.getByText('Nothing more to load')
  })
})
