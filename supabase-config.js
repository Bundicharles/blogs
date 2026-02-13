const SUPABASE_URL = 'https://slxlxypodajykolluinsn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNseGx4eXBvZGFqeWtvbGx1aXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MDI4NjQsImV4cCI6MjA4NjQ3ODg2NH0.s0zmYnWO0po-8kFOzrXBDlPNKnYMhMdxLGqFSAZIMGc';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabase;