import { useEffect } from 'react'
import { supabase } from './supabaseClient'

function App() {
  useEffect(() => {
    const test = async () => {
      const { data, error } = await supabase.from('Users').select('*')
      console.log('data:', data)
      console.log('error:', error)
    }
    test()
  }, [])

  return <div>테스트 중...</div>
}

export default App