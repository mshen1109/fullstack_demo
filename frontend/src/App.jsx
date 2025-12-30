import { useState, useEffect } from 'react'
import './App.css'

// Detect API URL at runtime - works in Railway without rebuild
// In production (Railway), frontend and backend are separate domains
// In development, use relative URLs
const API_URL = window.location.hostname.includes('railway.app')
  ? 'https://backend-production-0d0e.up.railway.app'
  : (import.meta.env.VITE_API_URL || '');

function App() {
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [error, setError] = useState('');
  const [newUser, setNewUser] = useState('');


  // Fetch tasks
  const fetchTasks = async () => {
    try {
      if (!newUser) {
        setTasks([]);
        return;
      }
      const url = `${API_URL}/api/tasks?user=${encodeURIComponent(newUser)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error(err)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchTasks();
  }, [newUser]);

  // Add task
  const addTask = async (e) => {
    e.preventDefault()
    setError('')

    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTask, user: newUser }),
      })
      console.log('Sending task to backend:', { title: newTask });

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong')
      }

      setNewTask('')
      // fetchTasks() // No longer need to re-fetch
      if (data.allTasks) {
        setTasks(data.allTasks);
      } else {
        console.log('Optimized update failed, falling back to full fetch');
        fetchTasks();
      }
    } catch (err) {
      setError(err.message)
    }
  }

  // Delete a task
  const deleteTask = async (id) => {
    try {
      const url = newUser ? `${API_URL}/api/tasks/${id}?user=${encodeURIComponent(newUser)}` : `${API_URL}/api/tasks/${id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      // fetchTasks(); // No longer need to re-fetch
      if (data.allTasks) {
        setTasks(data.allTasks);
      } else if (res.ok) {
        // Fallback if allTasks isn't returned for some reason, though it should be
        console.log('Optimized update failed, falling back to full fetch');
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container">
      <h1>Fullstack Miaomiao Shen Task Manager</h1>

      <div className="card">
        <form onSubmit={addTask}>
          <input
            type="text"
            placeholder="Enter your username..."
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
          />

          <input
            type="text"
            placeholder="Enter a new task..."
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
          />
          <button type="submit">Add Task</button>
        </form>
        <button onClick={fetchTasks} style={{ marginTop: '8px' }}>Refresh All</button>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="task-list">
        {tasks.map((task) => (
          <div key={task._id} className="task-item">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input type="checkbox" title="Delete" onChange={() => deleteTask(task._id)} style={{ marginRight: '10px' }} />
              <span style={{ fontWeight: 'bold' }}>{task.title}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.75em', textAlign: 'right' }}>
              <span style={{ fontWeight: 'bold', marginBottom: '2px' }}>{task.user}</span>
              <span>Cr: {new Date(task.createdAt).toLocaleString()}</span>
              {task.updatedAt && task.updatedAt !== task.createdAt && (
                <span>Up: {new Date(task.updatedAt).toLocaleString()}</span>
              )}
            </div>
          </div>
        ))}
        {tasks.length === 0 && <p>No tasks yet.</p>}
      </div>
    </div>
  )
}

export default App
