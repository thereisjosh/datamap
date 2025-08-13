-- Create storage bucket for ERD files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('erd-files', 'erd-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ERD files
CREATE POLICY "Users can upload ERD files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'erd-files' AND
        auth.role() = 'authenticated'
    );

CREATE POLICY "Users can view accessible ERD files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'erd-files' AND
        auth.role() = 'authenticated'
    );

CREATE POLICY "Users can update their ERD files" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'erd-files' AND
        auth.role() = 'authenticated' AND
        owner = auth.uid()
    );

CREATE POLICY "Users can delete their ERD files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'erd-files' AND
        auth.role() = 'authenticated' AND
        owner = auth.uid()
    );