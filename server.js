const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
app.use(cors({
    origin: [
        'https://kvsecontent.github.io', // GitHub Pages domain (without trailing slash)
        'http://localhost:5500' // For local testing
    ],
    methods: ['GET'],
    allowedHeaders: ['Content-Type']
}));

// Exam Results Endpoint
app.get('/api/exam-results', async (req, res) => {
    try {
        const rollNumber = req.query.rollNumber;
        
        if (!rollNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Roll number is required'
            });
        }

        // Google Sheets API request
        const response = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values/Sheet1!A1:Z100`, {
            params: {
                key: process.env.GOOGLE_SHEETS_API_KEY
            }
        });

        // Process and sanitize data
        const rawData = response.data.values || [];
        const headers = rawData[0] || [];
        const results = rawData.slice(1).map(row => 
            headers.reduce((obj, header, index) => {
                obj[header] = row[index] || '';
                return obj;
            }, {})
        );

        // Find student by roll number
        const student = results.find(result => result.rollNumber === rollNumber);

        if (!student) {
            return res.json({
                status: 'error',
                message: 'Student not found'
            });
        }

        // Format student data to match frontend expectations
        const formattedStudent = {
            name: student.name || '',
            class: student.class || '',
            school: student.school || 'PM SHRI KENDRIYA VIDYALAYA RAEBARELI',
            subjects: [],
            totalObtained: 0,
            totalMarks: 0,
            percentage: '0',
            cgpa: '0',
            result: 'FAIL'
        };

        // Extract and process subjects
        const subjectKeys = Object.keys(student).filter(key => 
            key.includes('subject') || key.includes('Subject')
        );

        let totalObtained = 0;
        let totalMaxMarks = 0;

        // Process subject data
        for (let i = 1; i <= 5; i++) {
            const subjectNameKey = `subject${i}`;
            const subjectMarksKey = `marks${i}`;
            const maxMarksKey = `maxMarks${i}`;

            if (student[subjectNameKey] && student[subjectMarksKey]) {
                const subjectName = student[subjectNameKey];
                const obtainedMarks = parseInt(student[subjectMarksKey]) || 0;
                const maxMarks = parseInt(student[maxMarksKey] || '100');
                
                // Calculate grade
                const percentage = (obtainedMarks / maxMarks) * 100;
                let grade = 'F';
                
                if (percentage >= 90) grade = 'A';
                else if (percentage >= 80) grade = 'B';
                else if (percentage >= 70) grade = 'C';
                else if (percentage >= 60) grade = 'D';

                formattedStudent.subjects.push({
                    name: subjectName,
                    maxMarks: maxMarks,
                    obtained: obtainedMarks,
                    grade: grade
                });

                totalObtained += obtainedMarks;
                totalMaxMarks += maxMarks;
            }
        }

        // Calculate overall results
        formattedStudent.totalObtained = totalObtained;
        formattedStudent.totalMarks = totalMaxMarks;
        
        if (totalMaxMarks > 0) {
            const overallPercentage = (totalObtained / totalMaxMarks) * 100;
            formattedStudent.percentage = overallPercentage.toFixed(2);
            formattedStudent.cgpa = (overallPercentage / 9.5).toFixed(1);
            formattedStudent.result = overallPercentage >= 33 ? 'PASS' : 'FAIL';
        }

        // Send formatted student data
        res.json({
            status: 'success',
            student: formattedStudent
        });

    } catch (error) {
        console.error('Error fetching exam results:', error.response ? error.response.data : error.message);
        res.status(500).json({
            status: 'error',
            message: 'Unable to fetch exam results'
        });
    }
});

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Backend proxy server running on port ${PORT}`);
});
