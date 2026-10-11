'use client'

import { m as motion } from 'framer-motion' // hafif mod: bkz. MotionProvider
import { useState, useEffect } from 'react'
import { FaYoutube, FaTwitter, FaInstagram, FaSpinner } from 'react-icons/fa'

interface SocialEmbedProps {
  url: string
  type: 'youtube' | 'twitter' | 'instagram'
  title: string
}

// URL HTML attribute'una konmadan önce escape edilir (tırnakla attribute dışına çıkılamasın)
const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default function SocialEmbed({ url, type, title }: SocialEmbedProps) {
  const [loading, setLoading] = useState(true)
  const [embedHtml, setEmbedHtml] = useState('')

  useEffect(() => {
    const loadEmbed = async () => {
      try {
        if (type === 'youtube') {
          // YouTube video ID'sini çıkar
          let videoId = ''
          const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)
          if (match) {
            videoId = match[1]
          }
          
          if (videoId) {
            setEmbedHtml(`
              <iframe 
                width="100%" 
                height="315" 
                src="https://www.youtube.com/embed/${videoId}" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen
                class="rounded-xl"
              ></iframe>
            `)
          }
        } else if (type === 'twitter') {
          // Twitter embed için basit iframe
          const tweetId = url.split('/').pop()?.split('?')[0]
          if (tweetId) {
            setEmbedHtml(`
              <blockquote class="twitter-tweet" data-theme="dark">
                <a href="${escapeAttr(url)}"></a>
              </blockquote>
            `)
            // Twitter widget script'i yükle
            const script = document.createElement('script')
            script.src = 'https://platform.twitter.com/widgets.js'
            script.async = true
            document.body.appendChild(script)
          }
        } else if (type === 'instagram') {
          // Instagram embed
          setEmbedHtml(`
            <blockquote class="instagram-media" data-instgrm-permalink="${escapeAttr(url)}" data-instgrm-version="14" style="background:#000; border:0; border-radius:12px; max-width:100%; padding:0; width:calc(100% - 2px);">
            </blockquote>
          `)
          // Instagram embed script'i yükle
          const script = document.createElement('script')
          script.src = '//www.instagram.com/embed.js'
          script.async = true
          document.body.appendChild(script)
        }
        setLoading(false)
      } catch (error) {
        console.error('Embed loading error:', error)
        setLoading(false)
      }
    }

    loadEmbed()
  }, [url, type])

  const icons = {
    youtube: FaYoutube,
    twitter: FaTwitter,
    instagram: FaInstagram,
  }

  const Icon = icons[type]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-dynamic-card rounded-dynamic p-4 border border-dynamic-primary/20"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-dynamic-primary" />
        <h3 className="text-dynamic-text font-semibold">{title}</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 bg-black/20 rounded-xl">
          <FaSpinner className="w-8 h-8 text-dynamic-primary animate-spin" />
        </div>
      ) : (
        <div 
          className="embed-container max-w-full overflow-hidden"
          dangerouslySetInnerHTML={{ __html: embedHtml }}
        />
      )}
    </motion.div>
  )
}
