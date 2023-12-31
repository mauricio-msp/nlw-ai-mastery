import {
  type FormEvent,
  type ChangeEvent,
  useRef,
  useMemo,
  useState,
} from 'react'
import { FileVideo, Upload } from 'lucide-react'
import { fetchFile } from '@ffmpeg/util'

import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'

import { api } from '@/lib/axios'
import { getFFmpeg } from '@/lib/ffmpeg'

interface VideoInputFormProps {
  onVideoUploaded: (id: string) => void
}

type Status = 'waiting' | 'converting' | 'uploading' | 'generating' | 'success'

const statusMessage = {
  converting: 'Convertendo...',
  generating: 'Transcrevendo...',
  uploading: 'Carregando...',
  success: 'Sucesso!',
}

export function VideoInputForm({ onVideoUploaded }: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('waiting')

  const promptInputRef = useRef<HTMLTextAreaElement>(null)

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>): void {
    const { files } = event.currentTarget

    if (!files) return

    const selectedFile = files[0]

    setVideoFile(selectedFile)
  }

  async function convertVideoToAudio(video: File): Promise<File> {
    console.log('Convert started.')

    const ffmpeg = await getFFmpeg()

    await ffmpeg.writeFile('input.mp4', await fetchFile(video))

    ffmpeg.on('progress', (progress) => {
      console.log('Convert progress:', Math.round(progress.progress * 100))
    })

    await ffmpeg.exec([
      '-i',
      'input.mp4',
      '-map',
      '0:a',
      '-b:a',
      '20k',
      '-acodec',
      'libmp3lame',
      'output.mp3',
    ])

    const data = await ffmpeg.readFile('output.mp3')

    const audioFileBlob = new Blob([data], { type: 'audio/mpeg' })
    const audioFile = new File([audioFileBlob], 'audio.mp3', {
      type: 'audio/mpeg',
    })

    console.log('Convert finished.')

    return audioFile
  }

  async function handleUploadVideo(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    try {
      event.preventDefault()

      const prompt = promptInputRef.current?.value

      if (!videoFile) return

      setStatus('converting')

      const audioFile = await convertVideoToAudio(videoFile)

      const data = new FormData()
      data.append('file', audioFile)

      setStatus('uploading')

      const response = await api.post('/videos', data)
      const videoId = response.data.video.id

      setStatus('generating')

      await api.post(`/videos/${videoId}/transcription`, { prompt })

      setStatus('success')

      onVideoUploaded(videoId)
    } catch (error) {
      console.warn('❌ ~ handleUploadVideo ~ error:', error)
    }
  }

  const previewURL = useMemo(() => {
    if (!videoFile) return null

    return URL.createObjectURL(videoFile)
  }, [videoFile])

  return (
    <form onSubmit={handleUploadVideo} className="space-y-6">
      <label
        htmlFor="video"
        className="relative flex flex-col items-center justify-center w-full gap-2 text-sm border border-dashed rounded-md cursor-pointer aspect-video text-muted-foreground hover:bg-primary/5"
      >
        {previewURL ? (
          <video
            src={previewURL}
            controls={false}
            className="absolute inset-0 pointer-events-none"
          />
        ) : (
          <>
            <FileVideo className="w-4 h-4" />
            Selecione um vídeo
          </>
        )}
      </label>

      <input
        id="video"
        type="file"
        accept="video/mp4"
        className="sr-only"
        onChange={handleFileSelected}
      />

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="transcription_prompt">Prompt de transcrição</Label>
        <Textarea
          id="transcription_prompt"
          ref={promptInputRef}
          className="h-20 leading-relaxed resize-none"
          disabled={status !== 'waiting'}
          placeholder="Inclua palavras-chave mencionadas no vídeo separadas por vírgula (,)"
        />
      </div>

      <Button
        type="submit"
        className="w-full data-[success=true]:bg-emerald-400"
        disabled={status !== 'waiting'}
        data-success={status === 'success'}
      >
        {status === 'waiting' ? (
          <>
            Carregar vídeo
            <Upload className="w-4 h-4 ml-2" />
          </>
        ) : (
          statusMessage[status]
        )}
      </Button>
    </form>
  )
}
