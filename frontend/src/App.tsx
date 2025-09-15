import React, { useEffect, useState } from 'react'

function ExampleComponent({ message }: { message: string }) {
  return (
    <div className="p-6 bg-white rounded shadow">
      <h2 className="text-xl font-semibold">shadcn/ui example</h2>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
    </div>
  )
}

export default function App() {
  const [msg, setMsg] = useState('Loading...')

  useEffect(() => {
    fetch('/api/hello')
      .then((r) => r.json())
      .then((d) => setMsg(d.message))
      .catch(() => setMsg('Failed to fetch'))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-xl w-full p-6">
        <ExampleComponent message={msg} />
      </div>
    </div>
  )
}


