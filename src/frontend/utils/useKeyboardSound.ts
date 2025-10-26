import { useCallback, useRef, useEffect, useState } from 'react'
import ApiClient from './ApiClient'

export const useKeyboardSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)

  // Pre-load audio and check system settings
  useEffect(() => {
    const initializeSound = async () => {
      try {
        // Pre-load audio file first
        const audioUrl = new URL('../assets/keyboard_tap.wav', import.meta.url).href
        audioRef.current = new Audio(audioUrl)
        audioRef.current.volume = 0.3
        audioRef.current.preload = 'auto'
        
        // Pre-load the audio data
        await new Promise((resolve, reject) => {
          if (audioRef.current) {
            audioRef.current.addEventListener('canplaythrough', resolve, { once: true })
            audioRef.current.addEventListener('error', reject, { once: true })
            audioRef.current.load()
          } else {
            reject(new Error('Audio ref is null'))
          }
        })
        
        // Then check system settings
        const settings = await ApiClient.getSettings<any>('system')
        setSoundEnabled(settings.soundEffectsEnabled ?? true)
        
        setIsLoaded(true)
      } catch (error) {
        console.debug('Sound initialization failed, defaulting to enabled:', error)
        setSoundEnabled(true)
        setIsLoaded(true)
      }
    }
    
    initializeSound()
  }, [])

  const playKeySound = useCallback(() => {
    if (!soundEnabled || !isLoaded || !audioRef.current) return
    
    try {
      // Reset audio to beginning and play (audio is already pre-loaded)
      audioRef.current.currentTime = 0
      audioRef.current.play().catch((error) => {
        // Silently handle autoplay restrictions
        console.debug('Audio play failed:', error)
      })
    } catch (error) {
      console.debug('Audio play error:', error)
    }
  }, [soundEnabled, isLoaded])

  return { playKeySound, isLoaded }
}