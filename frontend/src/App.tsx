import React, { useState } from 'react'
import ReviewForm from './components/ReviewForm'
import ResultView from './components/ResultView'

export default function App() {
  const [markdown, setMarkdown] = useState('')

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-12 gap-6">
        <div className="col-span-5 bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-4">电路图评审 - 上传与参数</h2>
          <ReviewForm onResult={setMarkdown} />
        </div>
        <div className="col-span-7">
          <h2 className="text-lg font-semibold mb-4">评审结果</h2>
          <ResultView markdown={markdown || '等待提交结果...'} />
        </div>
      </div>
    </div>
  )
}


