'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, File, X } from 'lucide-react'

interface Props {
  onFile: (file: File) => void
  file: File | null
}

const ACCEPTED = ['.stl', '.obj', '.3mf', '.step', '.stp', '.pdf', '.png', '.jpg', '.jpeg', '.webp']

export default function FileDropzone({ onFile, file }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback((f: File) => {
    onFile(f)
  }, [onFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) accept(f)
  }, [accept])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) accept(f)
  }, [accept])

  if (file) {
    const ext = file.name.split('.').pop()?.toUpperCase() ?? 'FILE'
    const sizeMB = (file.size / 1024 / 1024).toFixed(2)
    return (
      <div className="flex items-center gap-4 p-5 rounded-2xl border border-[#00cc6630] bg-[#00cc6608]">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: '#00cc6618', color: '#00cc66' }}>
          {ext}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{file.name}</p>
          <p className="text-xs text-gray-400">{sizeMB} MB</p>
        </div>
        <button onClick={() => inputRef.current?.click()} className="p-2 rounded-lg hover:bg-black/5 transition-colors text-gray-400">
          <X size={16} />
        </button>
        <input ref={inputRef} type="file" accept={ACCEPTED.join(',')} className="hidden" onChange={onInput} />
      </div>
    )
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      className="cursor-pointer border-2 border-dashed rounded-2xl p-12 text-center transition-all"
      style={{ borderColor: dragging ? '#00cc66' : 'rgba(0,0,0,0.1)', background: dragging ? '#00cc6608' : 'transparent' }}
    >
      <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#00cc6612', color: '#00cc66' }}>
        <Upload size={28} />
      </div>
      <p className="font-semibold text-lg mb-2">Drop your file here</p>
      <p className="text-sm text-gray-400 mb-4">or click to browse</p>
      <p className="text-xs text-gray-300">
        Accepts: STL · OBJ · 3MF · STEP · PDF · PNG · JPG
      </p>
      <input ref={inputRef} type="file" accept={ACCEPTED.join(',')} className="hidden" onChange={onInput} />
    </div>
  )
}
